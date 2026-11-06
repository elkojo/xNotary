/**
 * Who a CMS signature names, and how it holds up.
 *
 * Shared by every reader of a CMS structure — a signature in a PDF, a `.p7s` in
 * a container, a timestamp token inside either — because all of them owe the
 * reader the same two things.
 *
 * **A name only on evidence.** A SignerInfo says which certificate signed it, by
 * issuer and serial or by key identifier. The bundle of certificates beside it
 * is in no required order, and on real files the first one is regularly a CA or
 * an OCSP responder. So the signer is looked up, never picked; when the lookup
 * fails the answer is "nobody it can name", not the nearest certificate.
 *
 * **Failures told apart.** The library throws for most of what can go wrong,
 * and those throws do not all mean the document changed.
 */
import * as asn1js from 'asn1js';
import {
  type AttributeTypeAndValue,
  Certificate,
  ContentInfo,
  IssuerAndSerialNumber,
  SignedData,
  type SignerInfo,
  TSTInfo,
  getCrypto,
} from 'pkijs';

import { checkLinks, orderChain, type ChainLink } from '../certificate/read/chain';
import { claimsOf, type CertificateClaims } from './claims';

const SUBJECT_KEY_IDENTIFIER = '2.5.29.14';

/** Digest algorithms a browser can compute, by the identifier a token names them with. */
const HASH_BY_OID: Record<string, string> = {
  '1.3.14.3.2.26': 'SHA-1',
  '2.16.840.1.101.3.4.2.1': 'SHA-256',
  '2.16.840.1.101.3.4.2.2': 'SHA-384',
  '2.16.840.1.101.3.4.2.3': 'SHA-512',
};

const equalBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

const certificatesIn = (signed: SignedData): Certificate[] =>
  (signed.certificates ?? []).filter(
    (candidate): candidate is Certificate => candidate instanceof Certificate,
  );

/** The certificate a SignerInfo identifies, or null when none in the bundle is it. */
export async function signerCertificateOf(
  signed: SignedData,
  index = 0,
): Promise<Certificate | null> {
  const sid = signed.signerInfos[index]?.sid;
  return sid ? certificateForSid(sid, certificatesIn(signed)) : null;
}

/** A browser's name for a digest algorithm, or null when it has none. */
export const hashForOid = (oid: string): string | null => HASH_BY_OID[oid] ?? null;

/** The certificate a signer identifier names, out of those given. */
export async function certificateForSid(sid: unknown, certificates: readonly Certificate[]): Promise<Certificate | null> {
  if (sid instanceof IssuerAndSerialNumber) {
    return (
      certificates.find(
        (certificate) =>
          certificate.issuer.isEqual(sid.issuer) &&
          certificate.serialNumber.isEqual(sid.serialNumber),
      ) ?? null
    );
  }

  const keyId = keyIdentifierOf(sid);
  if (!keyId) return null;
  for (const certificate of certificates) {
    const stated = statedKeyIdentifier(certificate);
    if (stated && equalBytes(stated, keyId)) return certificate;

    const key = certificate.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-1', key.slice().buffer as ArrayBuffer),
    );
    if (equalBytes(digest, keyId)) return certificate;
  }
  return null;
}

/** `[0] SubjectKeyIdentifier`, which the parser leaves as a raw tagged value. */
function keyIdentifierOf(sid: unknown): Uint8Array | null {
  const block = (sid as asn1js.Constructed | asn1js.Primitive | undefined)?.valueBlock;
  if (!block) return null;
  if ('valueHexView' in block && block.valueHexView.length > 0) return block.valueHexView;
  const inner = (block as asn1js.Constructed['valueBlock']).value?.[0] as
    | asn1js.OctetString
    | undefined;
  return inner?.valueBlock?.valueHexView ?? null;
}

function statedKeyIdentifier(certificate: Certificate): Uint8Array | null {
  const extension = certificate.extensions?.find((e) => e.extnID === SUBJECT_KEY_IDENTIFIER);
  if (!extension) return null;
  const parsed = asn1js.fromBER(
    extension.extnValue.valueBlock.valueHexView.slice().buffer as ArrayBuffer,
  );
  return parsed.result instanceof asn1js.OctetString ? parsed.result.valueBlock.valueHexView : null;
}

/** The common name of a distinguished name, or its last part if it has none. */
export function commonNameOf(parts: AttributeTypeAndValue[]): string | null {
  const commonName = parts.find((part) => part.type === '2.5.4.3');
  const chosen = commonName ?? parts[parts.length - 1];
  return (chosen?.value.valueBlock.value as string) ?? null;
}

/** What a signer's certificate lets a reader say about them, none of it vouched for. */
export interface SignerFacts {
  /** The signer, exactly as the certificate names them. Null when it cannot be resolved. */
  readonly signedBy: string | null;
  /** Who the signer's certificate says issued it. */
  readonly issuedBy: string | null;
  readonly certificate: Certificate | null;
  /** How many certificates came with the signature, the signer's included. */
  readonly certificateCount: number;
  readonly claims: CertificateClaims | null;
  /** The certificates above the signer's, each checked against the next. */
  readonly chain: readonly ChainLink[];
  /** Those same certificates, issuer first. */
  readonly issuers: readonly Certificate[];
}

export const NO_SIGNER: Omit<SignerFacts, 'certificateCount'> = {
  signedBy: null,
  issuedBy: null,
  certificate: null,
  claims: null,
  chain: [],
  issuers: [],
};

/** The facts for one certificate, given the others that arrived beside it. */
export async function factsFor(
  signer: Certificate | null,
  others: readonly Certificate[],
  certificateCount: number,
): Promise<SignerFacts> {
  if (!signer) return { ...NO_SIGNER, certificateCount };

  const rest = others.filter((other) => other !== signer);
  const issuers = rest.length > 0 ? orderChain(signer, rest) : [];
  return {
    signedBy: commonNameOf(signer.subject.typesAndValues),
    issuedBy: commonNameOf(signer.issuer.typesAndValues),
    certificate: signer,
    certificateCount,
    claims: claimsOf(signer),
    chain: issuers.length > 0 ? await checkLinks(signer, issuers) : [],
    issuers,
  };
}

/** The facts for one SignerInfo of a CMS structure. */
export async function signerFactsOf(signed: SignedData, index = 0): Promise<SignerFacts> {
  const certificates = certificatesIn(signed);
  return factsFor(await signerCertificateOf(signed, index), certificates, certificates.length);
}

export type SignatureCheck =
  /** The digest matches and the signature verifies. */
  | 'holds'
  /** The digest matches; the signature does not verify against the certificate. */
  | 'bad-signature'
  /** The signature describes different bytes. */
  | 'digest-mismatch'
  /** No certificate in the structure is the one it says signed it. */
  | 'no-certificate'
  /** The check itself could not run, usually an algorithm a browser does not have. */
  | 'cannot-check';

const MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const RSA_ENCRYPTION = '1.2.840.113549.1.1.1';

/**
 * Whether a SignerInfo's signature value verifies over `covered`. Throws on an algorithm it cannot run.
 *
 * The digest algorithm goes along only for plain rsaEncryption, which names none of its own.
 * Otherwise the signature algorithm says which hash it used, and may differ from the digest's.
 */
export function signatureValueHolds(info: SignerInfo, covered: Uint8Array, certificate: Certificate, hash: string): Promise<boolean> {
  return getCrypto(true).verifyWithPublicKey(
    covered.slice().buffer as ArrayBuffer,
    info.signature,
    certificate.subjectPublicKeyInfo,
    info.signatureAlgorithm,
    info.signatureAlgorithm.algorithmId === RSA_ENCRYPTION ? hash : undefined,
  );
}

/**
 * Run one SignerInfo's check against `content`, and say what happened.
 *
 * Done here rather than by the library's `verify`, for three reasons found the hard way. It
 * swaps `content` for any content embedded in the structure, so an attached signature over one
 * document read as covering whatever file sat beside it. It compares the digest before the
 * signature, so a forged digest attribute read as a changed file. And it reports unsupported
 * algorithms with the same code as a digest mismatch.
 *
 * So: the signature value first, and only then whether it describes these bytes.
 */
export async function checkSigner(
  signed: SignedData,
  index: number,
  content: Uint8Array,
): Promise<SignatureCheck> {
  const info = signed.signerInfos[index];
  if (!info) return 'cannot-check';

  const certificate = await signerCertificateOf(signed, index);
  if (!certificate) return 'no-certificate';

  const hash = hashForOid(info.digestAlgorithm.algorithmId);
  if (!hash) return 'cannot-check';

  let covered = content;
  let stated: Uint8Array | null = null;
  if (info.signedAttrs) {
    const attribute = info.signedAttrs.attributes.find((candidate) => candidate.type === MESSAGE_DIGEST);
    const value = attribute?.values[0] as asn1js.OctetString | undefined;
    if (!value?.valueBlock?.valueHexView) return 'bad-signature';
    stated = new Uint8Array(value.valueBlock.valueHexView);
    covered = new Uint8Array(info.signedAttrs.encodedValue);
  }

  let holds: boolean;
  try {
    holds = await signatureValueHolds(info, covered, certificate, hash);
  } catch {
    return 'cannot-check';
  }
  if (!holds) return 'bad-signature';

  if (stated) {
    const actual = new Uint8Array(await crypto.subtle.digest(hash, content.slice().buffer as ArrayBuffer));
    if (!equalBytes(actual, stated)) return 'digest-mismatch';
  }
  return 'holds';
}

/**
 * A timestamp attached to a signature, and how far it can be taken at its word.
 *
 * - `holds`: its imprint is this signature's, and its own signature verifies.
 * - `other-signature`: its imprint is some other digest. It attests to something
 *   else, and would look exactly like corroboration if nobody compared them.
 * - `broken`: it describes this signature, but its own signature does not verify,
 *   so anyone could have written that time.
 * - `cannot-check`: it uses something a browser cannot compute, or carries no
 *   certificate to check it against. No claim either way.
 */
export type TimestampStanding = 'holds' | 'other-signature' | 'broken' | 'cannot-check';

export interface AttachedTimestamp {
  readonly time: Date;
  readonly signedBy: string | null;
  /** The certificate that made it, for asking whether that authority is listed anywhere. */
  readonly certificate: Certificate | null;
  readonly standing: TimestampStanding;
}

/** A token's content, whichever way it encodes its OCTET STRING: real tokens use both. */
const tokenContent = (token: SignedData): Uint8Array | null => {
  const eContent = token.encapContentInfo.eContent;
  return eContent ? new Uint8Array(eContent.getValue()) : null;
};

/** What a token states, or null when it states nothing readable. */
export function readTstInfo(token: SignedData): TSTInfo | null {
  const content = tokenContent(token);
  if (!content) return null;
  try {
    return TSTInfo.fromBER(content.slice().buffer as ArrayBuffer);
  } catch {
    return null;
  }
}

/**
 * Read a token and check it against the bytes it ought to have stamped.
 *
 * Its own signature first: until that holds, the imprint and the time inside are only what the
 * file says. Holding means only that the certificate it carries made it. Whether that authority
 * means anything is a separate question (`listedTimeAuthority` in the directory).
 */
export async function readTimestampToken(
  token: SignedData,
  stamped: Uint8Array,
): Promise<AttachedTimestamp | null> {
  const info = readTstInfo(token);
  const content = tokenContent(token);
  if (!info || !content) return null;

  const certificate = await signerCertificateOf(token, 0);
  const described = {
    time: info.genTime,
    signedBy: certificate ? commonNameOf(certificate.subject.typesAndValues) : null,
    certificate,
  };

  const check = await checkSigner(token, 0, content);
  if (check === 'no-certificate' || check === 'cannot-check') return { ...described, standing: 'cannot-check' };
  if (check !== 'holds') return { ...described, standing: 'broken' };

  const hash = HASH_BY_OID[info.messageImprint.hashAlgorithm.algorithmId];
  if (!hash) return { ...described, standing: 'cannot-check' };

  const imprint = new Uint8Array(info.messageImprint.hashedMessage.valueBlock.valueHexView);
  const expected = new Uint8Array(await crypto.subtle.digest(hash, stamped.slice().buffer as ArrayBuffer));
  return { ...described, standing: equalBytes(imprint, expected) ? 'holds' : 'other-signature' };
}

/**
 * Parse BER with a node limit that fits the input.
 *
 * The parser's default of 10,000 nodes guards a server from a hostile file. Here the file
 * is already in memory and every node takes at least two of its bytes, so the size is the
 * bound. The default turned away real revocation lists: SNCA4's, at 4,652 entries, has more.
 */
export function parseBer(bytes: Uint8Array): asn1js.AsnType {
  const parsed = asn1js.fromBER(bytes, { maxNodes: Math.max(bytes.length, 10_000) });
  if (parsed.offset === -1) throw new Error(parsed.result.error || 'Not BER');
  return parsed.result;
}

/** A CMS structure as the SignedData inside it. Throws when it is not one. */
export function signedDataFrom(der: Uint8Array): SignedData {
  const content = new ContentInfo({ schema: parseBer(der) });
  return new SignedData({ schema: content.content });
}

/** A DER timestamp token as the SignedData inside it. Throws when it is not one. */
export const timestampTokenFrom = signedDataFrom;

/** `id-aa-signatureTimeStampToken`. */
const SIGNATURE_TIME_STAMP = '1.2.840.113549.1.9.16.2.14';

/**
 * The timestamp a CMS signature carries inside itself, if it carries one.
 *
 * Read out of the *unsigned* attributes, which is where it has to live: the token
 * is over the signature value, so it cannot exist until the signature does, and
 * cannot be covered by it. Being unsigned, anyone could have put it there, so it
 * is checked rather than read.
 */
export async function embeddedTimestampOf(
  signed: SignedData,
  index = 0,
): Promise<AttachedTimestamp | null> {
  const signerInfo = signed.signerInfos[index];
  const attribute = signerInfo?.unsignedAttrs?.attributes.find(
    (candidate) => candidate.type === SIGNATURE_TIME_STAMP,
  );
  if (!attribute) return null;

  try {
    const content = new ContentInfo({ schema: attribute.values[0] });
    return await readTimestampToken(
      new SignedData({ schema: content.content }),
      new Uint8Array(signerInfo.signature.valueBlock.valueHexView),
    );
  } catch {
    return null;
  }
}
