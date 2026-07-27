/**
 * PAdES signature parsing.
 *
 * Scope (MVP, per the project brief): parse each signature in a signed PDF,
 * check that the signature covers the document and that the document has not
 * been altered, and extract the signer's name, the issuing QTSP and the claimed
 * signing time.
 *
 * Explicitly OUT of scope here: deciding whether a signature is a *qualified*
 * electronic signature. That requires validating the certificate chain against
 * the EU Trusted Lists (EUTL) at the signing time, which the MVP delegates to an
 * external official validator. Everything this module reports about
 * qualified-ness is a *claim read out of the certificate*, never a verdict —
 * see `QualifiedClaim`.
 */
import * as asn1js from 'asn1js';
import {
  Certificate,
  ContentInfo,
  SignedData,
  type SignedAndUnsignedAttributes,
} from 'pkijs';

import { bytesEqual, toHex } from './hash';

/** OIDs we care about. */
const OID = {
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  /** ETSI signing-certificate-v2 (RFC 5035) — present on PAdES-B and above. */
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
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

export interface PadesSignature {
  /** 1-based position in the PDF's signature sequence. */
  readonly index: number;
  /** The `/ByteRange` array as written in the PDF. */
  readonly byteRange: readonly number[];
  /**
   * True when the ByteRange spans the whole file except the signature hole,
   * i.e. the signature covers the entire revision. A `false` here on the last
   * signature means bytes were appended after signing.
   */
  readonly coversWholeDocument: boolean;
  /** The signed bytes hash to the value in the CMS messageDigest attribute. */
  readonly documentIntegrity: boolean;
  /** Signer name, best-effort from the certificate subject. */
  readonly signerName: string;
  readonly subject: DistinguishedName;
  /** The issuing CA — for a QES this is the QTSP. */
  readonly issuer: DistinguishedName;
  /** Claimed signing time from the CMS signingTime attribute, if present. */
  readonly signingTime: Date | null;
  /**
   * Whether the CMS carries a signature-timestamp (PAdES-T). Without it the
   * signing time is only the signer's own claim.
   */
  readonly hasSignatureTimestamp: boolean;
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
    // Signature placeholders are zero-padded to a fixed length; trim the tail.
    const trimmed = hex.replace(/(00)+$/, '');
    const even = trimmed.length % 2 === 0 ? trimmed : trimmed.slice(0, -1);
    if (even.length === 0) continue;

    const contents = new Uint8Array(even.length / 2);
    for (let i = 0; i < contents.length; i++) {
      contents[i] = Number.parseInt(even.slice(i * 2, i * 2 + 2), 16);
    }
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
  const signatures: PadesSignature[] = [];
  const errors: string[] = [];

  const slots = findSignatureSlots(pdf);
  for (const [i, slot] of slots.entries()) {
    try {
      signatures.push(await parseOne(pdf, slot, i + 1));
    } catch (e) {
      errors.push(`Signature ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { signatures, errors };
}

async function parseOne(
  pdf: Uint8Array,
  slot: { byteRange: number[]; contents: Uint8Array },
  index: number,
): Promise<PadesSignature> {
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
  const signerCert = matchSignerCert(certs, signerInfo);
  if (!signerCert) throw new Error('Signer certificate not present in the CMS');

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

  // PAdES-T: an RFC 3161 token in the unsigned attributes.
  const hasSignatureTimestamp = Boolean(
    findAttr(signerInfo.unsignedAttrs, '1.2.840.113549.1.9.16.2.14'),
  );

  const last = slot.byteRange[2]! + slot.byteRange[3]!;
  const coversWholeDocument = last === pdf.length;
  if (!coversWholeDocument) {
    warnings.push(
      `Signature covers bytes 0–${last} of a ${pdf.length}-byte file; ` +
        `${pdf.length - last} byte(s) were appended after signing.`,
    );
  }
  if (!findAttr(signerInfo.signedAttrs, OID.signingCertificateV2)) {
    warnings.push('No signing-certificate-v2 attribute; not a PAdES-B baseline signature.');
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
    hasSignatureTimestamp,
    qualifiedClaim: readQualifiedClaim(signerCert),
    certificateSerial: toHex(new Uint8Array(signerCert.serialNumber.valueBlock.valueHexView)),
    certificateNotBefore: signerCert.notBefore.value,
    certificateNotAfter: signerCert.notAfter.value,
    digestAlgorithm,
    warnings,
  };
}

/** Resolve which of the bundled certificates the SignerInfo refers to. */
function matchSignerCert(certs: Certificate[], signerInfo: SignedData['signerInfos'][number]) {
  const sid = signerInfo.sid;

  // issuerAndSerialNumber form.
  if (sid instanceof Object && 'serialNumber' in sid && 'issuer' in sid) {
    const wanted = toHex(new Uint8Array((sid.serialNumber as asn1js.Integer).valueBlock.valueHexView));
    const found = certs.find(
      (c) => toHex(new Uint8Array(c.serialNumber.valueBlock.valueHexView)) === wanted,
    );
    if (found) return found;
  }
  // subjectKeyIdentifier form, or a single-certificate CMS.
  return certs.length === 1 ? certs[0] : undefined;
}
