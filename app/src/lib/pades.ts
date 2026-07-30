/**
 * PAdES signature parsing.
 *
 * Scope (MVP, per the project brief): parse each signature in a signed PDF,
 * check that the signature covers the document and that the document has not
 * been altered, and extract the signer's name, the issuing QTSP and the claimed
 * signing time.
 *
 * Explicitly OUT of scope here: deciding what legal status a signature has —
 * in the EU, whether it is a *qualified* electronic signature. That requires
 * validating the certificate chain against a trust list (in the EU, the EUTL)
 * at the signing time, which the MVP delegates to an external official
 * validator. Everything this module reports about qualified-ness is a *claim
 * read out of the certificate*, never a verdict — see `QualifiedClaim`.
 */
import * as asn1js from 'asn1js';
import {
  Certificate,
  ContentInfo,
  SignedData,
  TSTInfo,
  type RelativeDistinguishedNames,
  type SignedAndUnsignedAttributes,
} from 'pkijs';

import { bytesEqual, toHex } from './hash';

/** OIDs we care about. */
const OID = {
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  /** ETSI signing-certificate-v2 (RFC 5035) — present on PAdES-B and above. */
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  /** ESS signing-certificate (RFC 2634), the SHA-1-era predecessor of v2. */
  signingCertificateV1: '1.2.840.113549.1.9.16.2.12',
  /** RFC 3161 token over the signature value, in the unsigned attributes. */
  signatureTimeStampToken: '1.2.840.113549.1.9.16.2.14',
  /** id-ct-TSTInfo — the eContent type inside that token. */
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  qcStatements: '1.3.6.1.5.5.7.1.3',
  /** ETSI EN 319 412-5 */
  qcCompliance: '0.4.0.1862.1.1',
  qcSSCD: '0.4.0.1862.1.4',
  qcType: '0.4.0.1862.1.6',
  qcTypeEsign: '0.4.0.1862.1.6.1',
} as const;

/** Human-readable names for the X.500 attributes we surface. */
const DN_NAMES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.4': 'SN',
  '2.5.4.5': 'serialNumber',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.42': 'GN',
  '2.5.4.97': 'organizationIdentifier',
};

export interface DistinguishedName {
  /** Attribute short name → value, e.g. `{ CN: 'Jan Novak', O: 'I.CA' }`. */
  readonly attrs: Readonly<Record<string, string>>;
  /** RFC 4514-ish rendering, for display and for the certificate summary page. */
  readonly text: string;
}

/**
 * What the *certificate itself claims* about being qualified. This is not a
 * validation result: an untrusted certificate can assert all of these.
 */
export interface QualifiedClaim {
  /** ETSI EN 319 412-5 QcCompliance — "this is a qualified certificate". */
  readonly qcCompliance: boolean;
  /** Private key held in a qualified signature creation device. */
  readonly qcSSCD: boolean;
  /** Declared as a certificate for electronic signatures (rather than seals). */
  readonly qcTypeEsign: boolean;
  /** `nonRepudiation` key usage, expected on a signing certificate. */
  readonly nonRepudiation: boolean;
}

/**
 * An RFC 3161 timestamp token attached to a signature.
 *
 * Like everything else here this reports what the token says, not a verdict.
 * `time` is the TSA's assertion; nothing in the MVP checks that the TSA is
 * trusted, that its certificate was valid then, or that the token's own
 * signature verifies — that is an external-validator concern.
 *
 * `matchesSignature` is the one part that *is* checked here, and it is the part
 * that makes the time worth anything: it confirms the token was issued over
 * this signature's bytes rather than copied from another document.
 */
export interface SignatureTimestamp {
  /** `genTime` from the TSTInfo — when the TSA says it saw the signature. */
  readonly time: Date;
  /** The TSA, if its certificate travels in the token. */
  readonly authority: string | null;
  /** The token's message imprint is the hash of this signature's bytes. */
  readonly matchesSignature: boolean;
  /** Set when the imprint could not be checked, e.g. an unsupported digest. */
  readonly warning: string | null;
}

export interface PadesSignature {
  /** 1-based position in the PDF's signature sequence. */
  readonly index: number;
  /** The `/ByteRange` array as written in the PDF. */
  readonly byteRange: readonly number[];
  /**
   * True when the ByteRange spans the whole file except the signature hole.
   *
   * `false` is *normal* for every signature but the last in a countersigned
   * document: each signer signs the revision in front of them, and the next
   * signature is appended after it. Read this together with `supersededBy`
   * before saying anything alarming — only `false` with `supersededBy === null`
   * means bytes nobody signed were appended.
   */
  readonly coversWholeDocument: boolean;
  /**
   * The 1-based index of the next signature, when this one signed an earlier
   * revision that a later signature then covered. `null` when this signature
   * covers the whole document.
   *
   * What it means for the signer: they saw the document as it stood at their
   * revision, and did not see anything added afterwards.
   */
  readonly supersededBy: number | null;
  /** The signed bytes hash to the value in the CMS messageDigest attribute. */
  readonly documentIntegrity: boolean;
  /** Signer name, best-effort from the certificate subject. */
  readonly signerName: string;
  readonly subject: DistinguishedName;
  /** The issuing CA — for an EU qualified signature, the QTSP. */
  readonly issuer: DistinguishedName;
  /**
   * Claimed signing time from the CMS signingTime attribute.
   *
   * Often `null` on real qualified signatures: the attribute is optional, and
   * QTSPs that attach an RFC 3161 timestamp routinely omit it — the token is
   * better evidence than the signer's own clock. Prefer `signatureTimestamp`
   * and fall back to this.
   */
  readonly signingTime: Date | null;
  /**
   * The RFC 3161 signature timestamp (PAdES-T), if the CMS carries one.
   *
   * `null` means no token was present, so the only available time is the
   * signer's own claim in `signingTime`.
   */
  readonly signatureTimestamp: SignatureTimestamp | null;
  readonly qualifiedClaim: QualifiedClaim;
  readonly certificateSerial: string;
  readonly certificateNotBefore: Date;
  readonly certificateNotAfter: Date;
  readonly digestAlgorithm: string;
  /** Non-fatal problems encountered while parsing this signature. */
  readonly warnings: readonly string[];
}

export interface PadesParseResult {
  readonly signatures: readonly PadesSignature[];
  /** Parse failures that prevented a signature from being reported at all. */
  readonly errors: readonly string[];
}

/**
 * Locate every signature dictionary's `/ByteRange` and `/Contents` in the raw
 * PDF bytes.
 *
 * We scan the byte stream rather than building a full PDF object graph on
 * purpose: the ByteRange is defined over raw file offsets, so working from the
 * raw bytes is both simpler and closer to what a verifier must actually do.
 */
function findSignatureSlots(pdf: Uint8Array): Array<{ byteRange: number[]; contents: Uint8Array }> {
  const text = latin1(pdf);
  const slots: Array<{ byteRange: number[]; contents: Uint8Array }> = [];
  const brRe = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;

  for (let m = brRe.exec(text); m !== null; m = brRe.exec(text)) {
    const byteRange = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];

    // /Contents is the hex string sitting in the gap the ByteRange skips.
    const gapStart = byteRange[0]! + byteRange[1]!;
    const gapEnd = byteRange[2]!;
    if (!(gapEnd > gapStart) || gapEnd > pdf.length) continue;

    const gap = text.slice(gapStart, gapEnd);
    const open = gap.indexOf('<');
    const close = gap.lastIndexOf('>');
    if (open === -1 || close <= open) continue;

    const hex = gap.slice(open + 1, close).replace(/[^0-9a-fA-F]/g, '');
    const even = hex.length % 2 === 0 ? hex : hex.slice(0, -1);
    if (even.length === 0) continue;

    const contents = new Uint8Array(even.length / 2);
    for (let i = 0; i < contents.length; i++) {
      contents[i] = Number.parseInt(even.slice(i * 2, i * 2 + 2), 16);
    }

    // Writers pad /Contents with NUL bytes out to a fixed placeholder length.
    // We deliberately do NOT strip that padding: the last byte of a signature
    // is effectively random, so trimming trailing zeroes truncates roughly one
    // CMS in 256. DER is self-delimiting — `fromBER` reads the outer length and
    // ignores whatever follows, so the padding is harmless left in place.
    // An all-zero /Contents is an unsigned placeholder, not a signature.
    if (contents.every((b) => b === 0)) continue;

    slots.push({ byteRange, contents });
  }
  return slots;
}

/** The bytes the signature actually covers: the file minus the /Contents hole. */
function signedBytes(pdf: Uint8Array, byteRange: readonly number[]): Uint8Array {
  const [o1, l1, o2, l2] = byteRange as [number, number, number, number];
  const out = new Uint8Array(l1 + l2);
  out.set(pdf.subarray(o1, o1 + l1), 0);
  out.set(pdf.subarray(o2, o2 + l2), l1);
  return out;
}

function latin1(bytes: Uint8Array): string {
  // Chunked to stay clear of the argument-count limit on large PDFs.
  let out = '';
  const CHUNK = 32768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

function readDn(name: Certificate['subject']): DistinguishedName {
  const attrs: Record<string, string> = {};
  const parts: string[] = [];
  for (const tv of name.typesAndValues) {
    const key = DN_NAMES[tv.type] ?? tv.type;
    const value = String(tv.value.valueBlock.value);
    // Keep the first occurrence; multi-valued RDNs are rare and the first is
    // the one tools display.
    attrs[key] ??= value;
    parts.push(`${key}=${value}`);
  }
  return { attrs, text: parts.join(', ') };
}

function readQualifiedClaim(cert: Certificate): QualifiedClaim {
  let qcCompliance = false;
  let qcSSCD = false;
  let qcTypeEsign = false;
  let nonRepudiation = false;

  for (const ext of cert.extensions ?? []) {
    if (ext.extnID === '2.5.29.15') {
      // KeyUsage BIT STRING: bit 1 is nonRepudiation / contentCommitment.
      const parsed = asn1js.fromBER(ext.extnValue.valueBlock.valueHexView);
      const bits = parsed.result.valueBlock as unknown as { valueHexView?: Uint8Array };
      const first = bits.valueHexView?.[0] ?? 0;
      nonRepudiation = (first & 0b0100_0000) !== 0;
    }

    if (ext.extnID === OID.qcStatements) {
      const parsed = asn1js.fromBER(ext.extnValue.valueBlock.valueHexView);
      if (parsed.offset === -1) continue;
      const seq = parsed.result;
      if (!(seq instanceof asn1js.Sequence)) continue;

      for (const statement of seq.valueBlock.value) {
        if (!(statement instanceof asn1js.Sequence)) continue;
        const id = statement.valueBlock.value[0];
        if (!(id instanceof asn1js.ObjectIdentifier)) continue;
        const oid = id.valueBlock.toString();

        if (oid === OID.qcCompliance) qcCompliance = true;
        if (oid === OID.qcSSCD) qcSSCD = true;
        if (oid === OID.qcType) {
          const info = statement.valueBlock.value[1];
          if (info instanceof asn1js.Sequence) {
            for (const t of info.valueBlock.value) {
              if (t instanceof asn1js.ObjectIdentifier && t.valueBlock.toString() === OID.qcTypeEsign) {
                qcTypeEsign = true;
              }
            }
          }
        }
      }
    }
  }
  return { qcCompliance, qcSSCD, qcTypeEsign, nonRepudiation };
}

function findAttr(attrs: SignedAndUnsignedAttributes | undefined, type: string) {
  return attrs?.attributes.find((a) => a.type === type);
}

const DIGEST_OIDS: Record<string, string> = {
  '1.3.14.3.2.26': 'SHA-1',
  '2.16.840.1.101.3.4.2.1': 'SHA-256',
  '2.16.840.1.101.3.4.2.2': 'SHA-384',
  '2.16.840.1.101.3.4.2.3': 'SHA-512',
};

/**
 * Best-effort display name for a signer.
 *
 * Czech qualified certificates put the human name in CN; some put givenName and
 * surname in separate attributes with a CN that also carries the serial number.
 */
function displayName(subject: DistinguishedName): string {
  const { CN, GN, SN } = subject.attrs;
  if (GN && SN) return `${GN} ${SN}`;
  if (CN) return CN;
  return subject.text || '(unknown signer)';
}

export async function parsePades(pdf: Uint8Array): Promise<PadesParseResult> {
  const drafts: SignatureDraft[] = [];
  const errors: string[] = [];

  const slots = findSignatureSlots(pdf);
  for (const [i, slot] of slots.entries()) {
    try {
      drafts.push(await parseOne(pdf, slot, i + 1));
    } catch (e) {
      errors.push(`Signature ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { signatures: resolveCoverage(drafts, pdf.length), errors };
}

/** A parsed signature before the cross-signature coverage pass. */
type SignatureDraft = Omit<PadesSignature, 'warnings' | 'supersededBy'> & {
  warnings: string[];
  supersededBy: number | null;
};

/**
 * Decide what each signature's coverage *means*, which cannot be known from one
 * signature alone.
 *
 * In a countersigned PDF every signer signs the revision in front of them, then
 * the next signature is appended. So all but the last signature legitimately
 * stop short of the end of the file. Calling that "bytes were appended after
 * signing" would describe ordinary countersigning as if it were tampering —
 * and a document where every normal case raises an alarm teaches people to
 * ignore alarms.
 *
 * The genuinely suspicious case is bytes past the *furthest* signature: those
 * were added after everybody signed, and nobody has attested to them.
 */
function resolveCoverage(drafts: SignatureDraft[], fileLength: number): PadesSignature[] {
  const endOf = (s: SignatureDraft) => s.byteRange[2]! + s.byteRange[3]!;
  const furthest = drafts.reduce((max, s) => Math.max(max, endOf(s)), 0);

  for (const draft of drafts) {
    if (draft.coversWholeDocument) continue;

    // The next revision is the signature that covers the least while still
    // covering more than this one.
    const next = drafts
      .filter((other) => endOf(other) > endOf(draft))
      .sort((a, b) => endOf(a) - endOf(b))[0];

    if (next) {
      draft.supersededBy = next.index;
      continue;
    }

    // Nothing covers further, so these trailing bytes are unsigned.
    draft.warnings.push(
      `Signature covers bytes 0–${endOf(draft)} of a ${fileLength}-byte file; ` +
        `${fileLength - endOf(draft)} byte(s) were appended afterwards and are covered by no ` +
        `signature.`,
    );
  }

  // A trailing edit after the last signature shows up on that signature above;
  // this catches the case where it is not the furthest one for some reason.
  if (drafts.length > 0 && furthest < fileLength) {
    const last = drafts[drafts.length - 1]!;
    if (endOf(last) === furthest && last.warnings.length === 0) {
      last.warnings.push(
        `${fileLength - furthest} byte(s) at the end of the file are covered by no signature.`,
      );
    }
  }

  return drafts;
}

async function parseOne(
  pdf: Uint8Array,
  slot: { byteRange: number[]; contents: Uint8Array },
  index: number,
): Promise<SignatureDraft> {
  const warnings: string[] = [];

  const asn1 = asn1js.fromBER(slot.contents);
  if (asn1.offset === -1) throw new Error('/Contents is not valid DER');

  const contentInfo = new ContentInfo({ schema: asn1.result });
  const signedData = new SignedData({ schema: contentInfo.content });

  const signerInfo = signedData.signerInfos[0];
  if (!signerInfo) throw new Error('CMS SignedData carries no SignerInfo');

  const certs = (signedData.certificates ?? []).filter(
    (c): c is Certificate => c instanceof Certificate,
  );
  const signerCert = await matchSignerCert(certs, signerInfo);
  if (!signerCert) {
    throw new Error(
      `Could not identify the signer's certificate among the ${certs.length} in the CMS.`,
    );
  }

  const covered = signedBytes(pdf, slot.byteRange);

  // Document integrity: the messageDigest signed attribute must equal the hash
  // of the covered bytes. This is the check that catches an altered PDF.
  const digestAlgorithm = DIGEST_OIDS[signerInfo.digestAlgorithm.algorithmId] ?? 'unknown';
  let documentIntegrity = false;
  const mdAttr = findAttr(signerInfo.signedAttrs, OID.messageDigest);
  if (!mdAttr) {
    warnings.push('No messageDigest signed attribute; document integrity not checked.');
  } else if (digestAlgorithm === 'unknown') {
    warnings.push(
      `Unsupported digest algorithm ${signerInfo.digestAlgorithm.algorithmId}; integrity not checked.`,
    );
  } else {
    const expected = new Uint8Array(mdAttr.values[0].valueBlock.valueHexView);
    // `covered` is a fresh, tightly-packed buffer, so this cast is safe; it
    // only exists because TS models Uint8Array over SharedArrayBuffer too.
    const actual = new Uint8Array(
      await crypto.subtle.digest(digestAlgorithm, covered.buffer as ArrayBuffer),
    );
    documentIntegrity = bytesEqual(expected, actual);
  }

  const stAttr = findAttr(signerInfo.signedAttrs, OID.signingTime);
  let signingTime: Date | null = null;
  if (stAttr) {
    const v = stAttr.values[0];
    signingTime = v?.toDate instanceof Function ? v.toDate() : new Date(String(v.valueBlock.value));
    if (Number.isNaN(signingTime?.getTime())) signingTime = null;
  }

  // PAdES-T: an RFC 3161 token in the unsigned attributes. Real qualified
  // signatures often carry no signingTime attribute at all, so this is where
  // the signing time has to come from.
  let signatureTimestamp: SignatureTimestamp | null = null;
  const tsAttr = findAttr(signerInfo.unsignedAttrs, OID.signatureTimeStampToken);
  if (tsAttr) {
    try {
      signatureTimestamp = await readSignatureTimestamp(tsAttr.values[0], signerInfo);
    } catch (e) {
      warnings.push(
        `A signature timestamp is present but could not be read: ` +
          `${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Whether falling short of the end of the file is benign depends on the other
  // signatures, so the judgement is left to `parsePades`.
  const coversWholeDocument = slot.byteRange[2]! + slot.byteRange[3]! === pdf.length;
  // A signing-certificate attribute binds the signature to one specific
  // certificate. EN 319 142 baseline asks for v2, but v1 (RFC 2634) is still
  // what several QTSPs emit — PostSignum among them — so both count.
  if (
    !findAttr(signerInfo.signedAttrs, OID.signingCertificateV2) &&
    !findAttr(signerInfo.signedAttrs, OID.signingCertificateV1)
  ) {
    warnings.push(
      'No signing-certificate attribute; the signature is not bound to a specific certificate.',
    );
  }

  const subject = readDn(signerCert.subject);
  return {
    index,
    byteRange: slot.byteRange,
    coversWholeDocument,
    documentIntegrity,
    signerName: displayName(subject),
    subject,
    issuer: readDn(signerCert.issuer),
    signingTime,
    signatureTimestamp,
    supersededBy: null,
    qualifiedClaim: readQualifiedClaim(signerCert),
    certificateSerial: toHex(new Uint8Array(signerCert.serialNumber.valueBlock.valueHexView)),
    certificateNotBefore: signerCert.notBefore.value,
    certificateNotAfter: signerCert.notAfter.value,
    digestAlgorithm,
    warnings,
  };
}

/**
 * Read an RFC 3161 signature timestamp.
 *
 * The attribute value is a full CMS SignedData whose encapsulated content is a
 * TSTInfo. We take `genTime` from it, and — the part that gives the time any
 * weight — check that the token's message imprint really is the hash of this
 * signature's bytes.
 */
async function readSignatureTimestamp(
  value: asn1js.AsnType,
  signerInfo: SignedData['signerInfos'][number],
): Promise<SignatureTimestamp> {
  const token = new SignedData({ schema: new ContentInfo({ schema: value }).content });

  const { eContentType, eContent } = token.encapContentInfo;
  if (eContentType !== OID.tstInfo) {
    throw new Error(`token encapsulates ${eContentType}, not a TSTInfo`);
  }
  if (!eContent) throw new Error('token carries no TSTInfo content');

  const parsed = asn1js.fromBER(octets(eContent));
  if (parsed.offset === -1) throw new Error('TSTInfo is not valid DER');
  const tstInfo = new TSTInfo({ schema: parsed.result });

  // The TSA's own certificate travels in the token when it is present at all.
  const tsaCert = (token.certificates ?? []).find((c): c is Certificate => c instanceof Certificate);
  const authority = tsaCert ? displayIssuerName(readDn(tsaCert.subject)) : null;

  const imprintAlgorithm = DIGEST_OIDS[tstInfo.messageImprint.hashAlgorithm.algorithmId];
  if (!imprintAlgorithm) {
    return {
      time: tstInfo.genTime,
      authority,
      matchesSignature: false,
      warning:
        `The timestamp uses digest ${tstInfo.messageImprint.hashAlgorithm.algorithmId}, which ` +
        `this device cannot compute, so it was not checked against the signature.`,
    };
  }

  const signatureBytes = new Uint8Array(signerInfo.signature.valueBlock.valueHexView);
  const actual = new Uint8Array(
    await crypto.subtle.digest(imprintAlgorithm, signatureBytes.slice().buffer as ArrayBuffer),
  );
  const expected = new Uint8Array(tstInfo.messageImprint.hashedMessage.valueBlock.valueHexView);

  return {
    time: tstInfo.genTime,
    authority,
    matchesSignature: bytesEqual(expected, actual),
    warning: null,
  };
}

/** eContent may arrive as a constructed OCTET STRING split into chunks. */
function octets(content: asn1js.OctetString): Uint8Array {
  const direct = content.valueBlock.valueHexView;
  if (direct.length > 0) return new Uint8Array(direct);

  const chunks = (content.valueBlock.value ?? []).filter(
    (c): c is asn1js.OctetString => c instanceof asn1js.OctetString,
  );
  const total = chunks.reduce((n, c) => n + c.valueBlock.valueHexView.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c.valueBlock.valueHexView, at);
    at += c.valueBlock.valueHexView.length;
  }
  return out;
}

/** A TSA or CA is identified by its organisation and common name. */
function displayIssuerName(dn: DistinguishedName): string {
  const { CN, O } = dn.attrs;
  if (CN && O) return `${CN} (${O})`;
  return CN ?? O ?? dn.text;
}

/**
 * Resolve which of the bundled certificates the SignerInfo refers to.
 *
 * This decides whose name ends up on Certificate 2, so it resolves only on
 * evidence: either the SignerInfo's issuer *and* serial both match, or its key
 * identifier matches. There is no "just take the first certificate" fallback —
 * a real signature bundles the whole chain, and guessing within it would
 * attribute the signature to the wrong party. Failing to resolve is reported.
 */
async function matchSignerCert(
  certs: Certificate[],
  signerInfo: SignedData['signerInfos'][number],
): Promise<Certificate | undefined> {
  const sid = signerInfo.sid;

  // issuerAndSerialNumber form. Serial numbers are unique per issuer, not
  // globally, so matching on the serial alone can pick a different CA's
  // certificate out of the bundle.
  if (sid instanceof Object && 'serialNumber' in sid && 'issuer' in sid) {
    const wantedSerial = toHex(
      new Uint8Array((sid.serialNumber as asn1js.Integer).valueBlock.valueHexView),
    );
    const wantedIssuer = derOf(sid.issuer as RelativeDistinguishedNames);
    return certs.find(
      (c) =>
        toHex(new Uint8Array(c.serialNumber.valueBlock.valueHexView)) === wantedSerial &&
        derOf(c.issuer) === wantedIssuer,
    );
  }

  // subjectKeyIdentifier form: an IMPLICIT [0] primitive holding the raw key
  // identifier (RFC 5652 §5.3).
  if (sid instanceof asn1js.BaseBlock) {
    const wanted = toHex(new Uint8Array(sid.valueBlock.valueHexView));
    if (wanted.length === 0) return undefined;

    const byExtension = certs.find((c) => subjectKeyIdentifier(c) === wanted);
    if (byExtension) return byExtension;

    // Certificates are not obliged to carry the extension. RFC 5280 §4.2.1.2
    // method 1 derives the identifier as SHA-1 of the public key, which is what
    // issuers overwhelmingly use; a byte-for-byte hit is still a positive match.
    for (const c of certs) {
      const spk = c.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
      const digest = new Uint8Array(
        await crypto.subtle.digest('SHA-1', spk.slice().buffer as ArrayBuffer),
      );
      if (toHex(digest) === wanted) return c;
    }
  }

  return undefined;
}

/** DER of a distinguished name, for exact comparison. */
function derOf(name: RelativeDistinguishedNames): string {
  return toHex(new Uint8Array(name.toSchema().toBER(false)));
}

/** The certificate's own subjectKeyIdentifier extension value, if it has one. */
function subjectKeyIdentifier(cert: Certificate): string | undefined {
  const ext = cert.extensions?.find((e) => e.extnID === '2.5.29.14');
  if (!ext) return undefined;
  const parsed = asn1js.fromBER(ext.extnValue.valueBlock.valueHexView);
  if (parsed.offset === -1 || !(parsed.result instanceof asn1js.OctetString)) return undefined;
  return toHex(new Uint8Array(parsed.result.valueBlock.valueHexView));
}
