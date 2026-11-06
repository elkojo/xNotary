/**
 * The revocation answer a signature carries with it.
 *
 * Long-term signatures embed an OCSP response or a CRL, so reading one needs no
 * network: this app asks nobody, and reports what somebody else was told (owner's
 * decision, 2026-11-05).
 *
 * Be exact about what that is. These values sit in the signature's *unsigned*
 * properties, so anyone holding the file can add one. Verifying it shows that the
 * key of a certificate named as the responder produced this answer. It does not
 * show that this responder is entitled to answer, which is the same trust question
 * as the signer's name, and is not answered here. So a "not revoked" is reported as
 * something the file says, never as a finding, and it is never shown as a success.
 * A "revoked" is worth more than that: nobody forges one to their own disadvantage.
 *
 * An answer only speaks for the certificate it names. One about the timestamp
 * authority's certificate, which long-term signatures also carry, says nothing
 * about the signer, so it is matched and never just picked.
 */
import * as asn1js from 'asn1js';
import {
  BasicOCSPResponse,
  Certificate,
  CertificateRevocationList,
  OCSPResponse,
  OtherRevocationInfoFormat,
  type RelativeDistinguishedNames,
  SignedData,
  type SingleResponse,
  getCrypto,
} from 'pkijs';

import { commonNameOf, hashForOid, parseBer } from '../signer';
import { sameBytes } from './xml';

export type RevocationStatus = 'good' | 'revoked' | 'unknown';

export interface RevocationAnswer {
  readonly kind: 'OCSP' | 'CRL';
  readonly status: RevocationStatus;
  /** When revoked, according to the answer. */
  readonly revokedAt: Date | null;
  /** When the answer was given. Null when it could not be read at all. */
  readonly at: Date | null;
  /** Who it names as answering. Not vouched for. */
  readonly from: string | null;
  /**
   * A CRL states it keeps certificates after they expire (`ExpiredCertsOnCRL`).
   *
   * Without that, an authority may drop an expired certificate from later lists, so a list issued
   * after the certificate expired proves nothing by leaving it out.
   */
  readonly keepsExpired: boolean;
  /**
   * - `holds`: it verifies against the certificate it names as its source.
   * - `broken`: it does not, so it says nothing.
   * - `cannot-check`: that certificate is not here, it uses something a browser cannot
   *   compute, or the answer could not be read. An unreadable answer may be about this
   *   signer, so it is reported rather than passed over: a revocation nobody can read
   *   must not look like no revocation.
   */
  readonly standing: 'holds' | 'broken' | 'cannot-check';
}

export interface EmbeddedRevocation {
  readonly ocsp: readonly Uint8Array[];
  readonly crl: readonly Uint8Array[];
}

const OCSP_BASIC = '1.3.6.1.5.5.7.48.1.1';
/** RFC 5940's identifier for this, and the one real writers use instead. */
const OTHER_REVOCATION_OCSP = ['1.3.6.1.5.5.7.16.2', OCSP_BASIC];
const REVOCATION_VALUES = '1.2.840.113549.1.9.16.2.24';

const buffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

const hashOf = async (hash: string, bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest(hash, buffer(bytes)));

/** An issuer's name as it was encoded, since a digest is taken over those bytes. */
const encodedName = (name: RelativeDistinguishedNames): Uint8Array =>
  name.valueBeforeDecode && name.valueBeforeDecode.byteLength > 0
    ? new Uint8Array(name.valueBeforeDecode)
    : new Uint8Array(name.toSchema().toBER(false));

/** Whichever a file holds: the full OCSP response, or just its basic response. */
function basicResponseFrom(der: Uint8Array): BasicOCSPResponse | null {
  try {
    const response = new OCSPResponse({ schema: parseBer(der) });
    if (response.responseStatus.valueBlock.valueDec !== 0 || !response.responseBytes) return null;
    if (response.responseBytes.responseType !== OCSP_BASIC) return null;
    return new BasicOCSPResponse({ schema: parseBer(new Uint8Array(response.responseBytes.response.getValue())) });
  } catch {
    try {
      return new BasicOCSPResponse({ schema: parseBer(der) });
    } catch {
      return null;
    }
  }
}

/** Whether a single response's CertID is this certificate's, on all the evidence available. */
async function isAbout(single: SingleResponse, certificate: Certificate, issuers: readonly Certificate[]): Promise<boolean> {
  if (!single.certID.serialNumber.isEqual(certificate.serialNumber)) return false;

  const hash = hashForOid(single.certID.hashAlgorithm.algorithmId);
  if (!hash) return false;

  const nameHash = new Uint8Array(single.certID.issuerNameHash.valueBlock.valueHexView);
  if (!sameBytes(await hashOf(hash, encodedName(certificate.issuer)), nameHash)) return false;

  // The issuer's key is the stronger half, when its certificate is here to compare. A CA that was
  // re-keyed has several certificates of one name, and only the right one can match.
  if (issuers.length === 0) return true;
  const keyHash = new Uint8Array(single.certID.issuerKeyHash.valueBlock.valueHexView);
  for (const issuer of issuers) {
    const key = new Uint8Array(issuer.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView);
    if (sameBytes(await hashOf(hash, key), keyHash)) return true;
  }
  return false;
}

function statusOf(single: SingleResponse): { status: RevocationStatus; revokedAt: Date | null } {
  const raw = single.certStatus as asn1js.Constructed | asn1js.Primitive;
  switch (raw.idBlock.tagNumber) {
    case 0:
      return { status: 'good', revokedAt: null };
    case 1: {
      const time = (raw as asn1js.Constructed).valueBlock.value?.[0] as asn1js.GeneralizedTime | undefined;
      return { status: 'revoked', revokedAt: time?.toDate?.() ?? null };
    }
    default:
      return { status: 'unknown', revokedAt: null };
  }
}

/** The certificate that made a response, by the identifier the response gives. */
async function responderOf(basic: BasicOCSPResponse, others: readonly Certificate[]): Promise<Certificate | null> {
  const candidates = [...(basic.certs ?? []), ...others];
  const id = basic.tbsResponseData.responderID;

  if (id instanceof asn1js.OctetString) {
    const keyId = new Uint8Array(id.valueBlock.valueHexView);
    for (const candidate of candidates) {
      const key = new Uint8Array(candidate.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView);
      if (sameBytes(await hashOf('SHA-1', key), keyId)) return candidate;
    }
    return null;
  }
  return candidates.find((candidate) => candidate.subject.isEqual(id as RelativeDistinguishedNames)) ?? null;
}

const UNREADABLE = (kind: RevocationAnswer['kind']): RevocationAnswer => ({
  kind,
  status: 'unknown',
  revokedAt: null,
  at: null,
  from: null,
  keepsExpired: false,
  standing: 'cannot-check',
});

/** The extensions a list may carry that change what its silence means. */
const DELTA_CRL = '2.5.29.27';
const ISSUING_DISTRIBUTION_POINT = '2.5.29.28';
const EXPIRED_CERTS_ON_CRL = '2.5.29.60';

async function readOcsp(
  der: Uint8Array,
  certificate: Certificate,
  issuers: readonly Certificate[],
  others: readonly Certificate[],
): Promise<RevocationAnswer | null> {
  const basic = basicResponseFrom(der);
  if (!basic) return UNREADABLE('OCSP');

  for (const single of basic.tbsResponseData.responses) {
    if (!(await isAbout(single, certificate, issuers))) continue;

    const responder = await responderOf(basic, others);
    const described = {
      kind: 'OCSP' as const,
      ...statusOf(single),
      at: basic.tbsResponseData.producedAt,
      from: responder ? commonNameOf(responder.subject.typesAndValues) : null,
      keepsExpired: false,
    };
    if (!responder) return { ...described, standing: 'cannot-check' };

    try {
      const holds = await getCrypto(true).verifyWithPublicKey(
        basic.tbsResponseData.tbsView.slice().buffer as ArrayBuffer,
        basic.signature,
        responder.subjectPublicKeyInfo,
        basic.signatureAlgorithm,
      );
      return { ...described, standing: holds ? 'holds' : 'broken' };
    } catch {
      return { ...described, standing: 'cannot-check' };
    }
  }
  return null;
}

async function readCrl(der: Uint8Array, certificate: Certificate, others: readonly Certificate[]): Promise<RevocationAnswer | null> {
  let list: CertificateRevocationList;
  try {
    list = new CertificateRevocationList({ schema: parseBer(der) });
  } catch {
    return UNREADABLE('CRL');
  }
  if (!list.issuer.isEqual(certificate.issuer)) return null;

  // A delta or scoped list leaves certificates out on purpose, so its silence means nothing.
  const scoped = list.crlExtensions?.extensions.some((extension) => extension.extnID === DELTA_CRL || extension.extnID === ISSUING_DISTRIBUTION_POINT);

  const entry = list.revokedCertificates?.find((revoked) => revoked.userCertificate.isEqual(certificate.serialNumber));
  const described = {
    kind: 'CRL' as const,
    status: (entry ? 'revoked' : 'good') as RevocationStatus,
    revokedAt: entry?.revocationDate.value ?? null,
    at: list.thisUpdate.value,
    from: commonNameOf(list.issuer.typesAndValues),
    keepsExpired: list.crlExtensions?.extensions.some((extension) => extension.extnID === EXPIRED_CERTS_ON_CRL) ?? false,
  };

  if (scoped && !entry) return { ...described, status: 'unknown', standing: 'cannot-check' };
  const signers = others.filter((candidate) => candidate.subject.isEqual(list.issuer));
  if (signers.length === 0) return { ...described, standing: 'cannot-check' };

  let ran = false;
  for (const signer of signers) {
    try {
      if (await list.verify({ issuerCertificate: signer })) return { ...described, standing: 'holds' };
      ran = true;
    } catch {
      // Another certificate of this name may be the one.
    }
  }
  return { ...described, standing: ran ? 'broken' : 'cannot-check' };
}

/** Worst first: a verified "revoked" outranks everything, and nothing outranks being wrong about it. */
const rank = (answer: RevocationAnswer): number => {
  if (answer.standing === 'holds' && answer.status === 'revoked') return 0;
  if (answer.standing === 'broken') return 1;
  if (answer.standing === 'cannot-check') return 3;
  return answer.status === 'unknown' ? 2 : 4;
};

/**
 * What a signature's embedded answers say about one certificate, or null when none
 * of them is about it. Of several, the worst; among equals, the newest.
 */
export async function revocationOf(
  certificate: Certificate,
  others: readonly Certificate[],
  embedded: EmbeddedRevocation,
): Promise<RevocationAnswer | null> {
  const issuers = others.filter((candidate) => candidate !== certificate && candidate.subject.isEqual(certificate.issuer));

  const answers: RevocationAnswer[] = [];
  for (const der of embedded.ocsp) {
    const answer = await readOcsp(der, certificate, issuers, others);
    if (answer) answers.push(answer);
  }
  for (const der of embedded.crl) {
    const answer = await readCrl(der, certificate, others);
    if (answer) answers.push(answer);
  }

  answers.sort((a, b) => rank(a) - rank(b) || (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  return answers[0] ?? null;
}

/**
 * Where a CMS signature keeps them: `SignedData.crls`, and for CAdES the
 * `revocationValues` attribute, which is `SEQUENCE { crlVals [0], ocspVals [1] }`.
 */
export function revocationInCms(signed: SignedData, index: number): EmbeddedRevocation {
  const ocsp: Uint8Array[] = [];
  const crl: Uint8Array[] = [];

  for (const entry of signed.crls ?? []) {
    if (entry instanceof CertificateRevocationList) {
      crl.push(new Uint8Array(entry.toSchema().toBER(false)));
    } else if (entry instanceof OtherRevocationInfoFormat && OTHER_REVOCATION_OCSP.includes(entry.otherRevInfoFormat)) {
      ocsp.push(new Uint8Array((entry.otherRevInfo as asn1js.BaseBlock).toBER(false)));
    }
  }

  const attribute = signed.signerInfos[index]?.unsignedAttrs?.attributes.find((candidate) => candidate.type === REVOCATION_VALUES);
  const values = (attribute?.values[0] as asn1js.Sequence | undefined)?.valueBlock?.value ?? [];
  for (const group of values) {
    const target = group.idBlock.tagNumber === 0 ? crl : group.idBlock.tagNumber === 1 ? ocsp : null;
    if (!target) continue;
    const members = (group as asn1js.Constructed).valueBlock.value?.[0] as asn1js.Sequence | undefined;
    for (const member of members?.valueBlock?.value ?? []) target.push(new Uint8Array(member.toBER(false)));
  }

  return { ocsp, crl };
}
