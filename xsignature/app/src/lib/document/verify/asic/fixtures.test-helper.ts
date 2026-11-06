/**
 * Containers made by the test suite.
 *
 * Generated rather than committed. A real container carries a qualified
 * certificate, and a qualified certificate carries a real name and often a
 * personal identifier, none of which can be removed without breaking it. So real
 * files are for checking by hand on the machine they live on, and what the suite
 * pins is structure: every variant here is signed with a throwaway key made when
 * the tests run.
 */
import { DOMParser } from '@xmldom/xmldom';
import * as asn1js from 'asn1js';
import {
  AlgorithmIdentifier,
  Attribute,
  AttributeTypeAndValue,
  BasicOCSPResponse,
  CertID,
  Certificate,
  CertificateRevocationList,
  ContentInfo,
  EncapsulatedContentInfo,
  Extension,
  Extensions,
  IssuerAndSerialNumber,
  MessageImprint,
  OCSPResponse,
  ResponseBytes,
  ResponseData,
  RevokedCertificate,
  SignedAndUnsignedAttributes,
  SignedData,
  SignerInfo,
  SingleResponse,
  Time,
  TSTInfo,
} from 'pkijs';

import { C14N_EXCLUSIVE, canonicalize } from './c14n';
import type { ParseXml } from './types';
import { crc32 } from './zip';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const SHA256_URI = 'http://www.w3.org/2001/04/xmlenc#sha256';
export const ASIC_E = 'application/vnd.etsi.asic-e+zip';
export const ASIC_S = 'application/vnd.etsi.asic-s+zip';

/** The suite's parser, standing in for the browser's. Malformed XML throws. */
export const parseXml: ParseXml = (text) =>
  new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message: string) => {
        throw new Error(message);
      },
      fatalError: (message: string) => {
        throw new Error(message);
      },
    },
  }).parseFromString(text, 'text/xml') as unknown as Document;

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const base64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const sha = async (bytes: Uint8Array, hash = 'SHA-256'): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest(hash, bytes.slice().buffer as ArrayBuffer));

const buffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

export interface Signer {
  readonly certificate: Certificate;
  readonly der: Uint8Array;
  readonly privateKey: CryptoKey;
  readonly publicKey: CryptoKey;
  readonly kind: 'RSA' | 'EC';
}

/** A certificate for an existing key, so one key can wear two names. */
export async function certificateFor(
  name: string,
  keys: { privateKey: CryptoKey; publicKey: CryptoKey },
  kind: 'RSA' | 'EC',
  serial = 1,
): Promise<Signer> {
  const certificate = new Certificate();
  certificate.version = 2;
  certificate.serialNumber = new asn1js.Integer({ value: serial });
  const dn = () => new AttributeTypeAndValue({ type: '2.5.4.3', value: new asn1js.Utf8String({ value: name }) });
  certificate.issuer.typesAndValues.push(dn());
  certificate.subject.typesAndValues.push(dn());
  certificate.notBefore.value = new Date(Date.UTC(2020, 0, 1));
  certificate.notAfter.value = new Date(Date.UTC(2039, 0, 1));
  await certificate.subjectPublicKeyInfo.importKey(keys.publicKey);
  await certificate.sign(keys.privateKey, 'SHA-256');
  return {
    certificate,
    der: new Uint8Array(certificate.toSchema().toBER(false)),
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    kind,
  };
}

export async function makeSigner(name = 'Řehoř Čížek', kind: 'RSA' | 'EC' = 'RSA'): Promise<Signer> {
  const keys = (await crypto.subtle.generateKey(
    kind === 'RSA'
      ? { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  return certificateFor(name, keys, kind);
}

export interface SignedReference {
  readonly uri: string;
  readonly bytes: Uint8Array;
  readonly digestUri?: string;
  readonly type?: string;
}

export interface XadesOptions {
  readonly canonicalization?: string;
  /** What it signs besides its own properties. By default, every file. */
  readonly references?: readonly SignedReference[];
  /** Sign these through a `ds:Manifest` rather than directly. */
  readonly viaManifest?: boolean;
  /** Unsigned content for the `QualifyingProperties`, given the signature value's canonical bytes. */
  readonly unsigned?: (signatureValue: Uint8Array) => Promise<string> | string;
  /** Replaces the certificate placed in `KeyInfo`. */
  readonly keyInfoCertificate?: Signer;
  /** Ids, so that a nested signature does not collide with its parent. */
  readonly id?: string;
  /** Make this a counter-signature over a parent `SignatureValue`, rendered exclusively. */
  readonly counterSigning?: { readonly parentId: string; readonly value: Uint8Array };
}

const referenceXml = (reference: { uri: string; digest: string; digestUri?: string; type?: string; transform?: string }): string =>
  `<ds:Reference URI="${reference.uri}"${reference.type ? ` Type="${reference.type}"` : ''}>${
    reference.transform ? `<ds:Transforms><ds:Transform Algorithm="${reference.transform}"/></ds:Transforms>` : ''
  }<ds:DigestMethod Algorithm="${reference.digestUri ?? SHA256_URI}"/><ds:DigestValue>${reference.digest}</ds:DigestValue></ds:Reference>`;

/** A `META-INF/signatures*.xml` holding one signature over the given files. */
export async function makeXades(
  files: Readonly<Record<string, Uint8Array>>,
  signer: Signer,
  options: XadesOptions = {},
): Promise<string> {
  const canonicalization = options.canonicalization ?? C14N_EXCLUSIVE;
  const id = options.id ?? 'S0';
  const references: readonly SignedReference[] =
    options.references ??
    Object.entries(files).map(([name, bytes]) => ({ uri: encodeURIComponent(name), bytes }));

  const dataReferences = await Promise.all(
    references.map(async (reference) =>
      referenceXml({ uri: reference.uri, digest: base64(await sha(reference.bytes)), digestUri: reference.digestUri, type: reference.type }),
    ),
  );

  const properties = `<xades:SignedProperties Id="${id}-SP"><xades:SignedSignatureProperties><xades:SigningTime>2026-11-05T10:00:00Z</xades:SigningTime><xades:SigningCertificateV2><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="${SHA256_URI}"/><ds:DigestValue>${base64(await sha(signer.der))}</ds:DigestValue></xades:CertDigest></xades:Cert></xades:SigningCertificateV2></xades:SignedSignatureProperties></xades:SignedProperties>`;
  const manifest = options.viaManifest ? `<ds:Object><ds:Manifest Id="M">${dataReferences.join('')}</ds:Manifest></ds:Object>` : '';

  const wrap = (signedInfo: string, value: string, unsigned: string): string =>
    `<?xml version="1.0" encoding="UTF-8"?><asic:XAdESSignatures xmlns:asic="http://uri.etsi.org/02918/v1.2.1#" xmlns:ds="${DS_NS}" xmlns:xades="${XADES_NS}"><ds:Signature Id="${id}">${signedInfo}<ds:SignatureValue Id="${id}-SV">${value}</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${base64((options.keyInfoCertificate ?? signer).der)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>${manifest}<ds:Object><xades:QualifyingProperties Target="#${id}">${properties}${unsigned}</xades:QualifyingProperties></ds:Object></ds:Signature></asic:XAdESSignatures>`;

  const firstOf = (document: Document, name: string, namespace: string): Element =>
    document.getElementsByTagNameNS(namespace, name)[0] as Element;

  const skeleton = parseXml(wrap('<ds:SignedInfo/>', '', ''));
  const propertiesDigest = base64(
    await sha(canonicalize(firstOf(skeleton, 'SignedProperties', XADES_NS), canonicalization)),
  );

  let direct = dataReferences.join('');
  if (options.viaManifest) {
    const manifestDigest = base64(await sha(canonicalize(firstOf(skeleton, 'Manifest', DS_NS), canonicalization)));
    direct = referenceXml({
      uri: '#M',
      digest: manifestDigest,
      type: `${DS_NS}Manifest`,
      transform: canonicalization,
    });
  }

  const method =
    signer.kind === 'RSA' ? 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' : 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256';
  const signedInfo = `<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="${canonicalization}"/><ds:SignatureMethod Algorithm="${method}"/>${direct}${referenceXml(
    { uri: `#${id}-SP`, digest: propertiesDigest, type: 'http://uri.etsi.org/01903#SignedProperties', transform: canonicalization },
  )}${
    options.counterSigning
      ? referenceXml({
          uri: `#${options.counterSigning.parentId}-SV`,
          digest: base64(await sha(options.counterSigning.value)),
          type: 'http://uri.etsi.org/01903#CountersignedSignature',
          transform: canonicalization,
        })
      : ''
  }</ds:SignedInfo>`;

  const toSign = canonicalize(firstOf(parseXml(wrap(signedInfo, '', '')), 'SignedInfo', DS_NS), canonicalization);
  const algorithm = signer.kind === 'RSA' ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: 'SHA-256' };
  const value = base64(new Uint8Array(await crypto.subtle.sign(algorithm, signer.privateKey, buffer(toSign))));

  const valueElement = firstOf(parseXml(wrap(signedInfo, value, '')), 'SignatureValue', DS_NS);
  const unsigned = options.unsigned ? await options.unsigned(canonicalize(valueElement, canonicalization)) : '';
  return wrap(signedInfo, value, unsigned);
}

/** A signature timestamp's unsigned properties, around a token. */
/** Just the `ds:Signature`, to nest as a counter-signature. Exclusive rendering lets it move. */
export const signatureElementOf = (xml: string, id: string): string => {
  const start = xml.indexOf(`<ds:Signature Id="${id}">`);
  return xml.slice(start, xml.lastIndexOf('</ds:Signature>') + '</ds:Signature>'.length);
};

export const unsignedXml = (content: string): string =>
  `<xades:UnsignedProperties><xades:UnsignedSignatureProperties>${content}</xades:UnsignedSignatureProperties></xades:UnsignedProperties>`;

export const counterSignatureXml = (signature: string): string => `<xades:CounterSignature>${signature}</xades:CounterSignature>`;

export const revocationValuesXml = (ocsp: readonly Uint8Array[], crl: readonly Uint8Array[] = []): string =>
  `<xades:RevocationValues>${crl.length ? `<xades:CRLValues>${crl.map((der) => `<xades:EncapsulatedCRLValue>${base64(der)}</xades:EncapsulatedCRLValue>`).join('')}</xades:CRLValues>` : ''}${
    ocsp.length ? `<xades:OCSPValues>${ocsp.map((der) => `<xades:EncapsulatedOCSPValue>${base64(der)}</xades:EncapsulatedOCSPValue>`).join('')}</xades:OCSPValues>` : ''
  }</xades:RevocationValues>`;

export const signatureTimestampXml = (token: Uint8Array, canonicalization: string | null = C14N_EXCLUSIVE): string =>
  `<xades:UnsignedProperties><xades:UnsignedSignatureProperties><xades:SignatureTimeStamp>${
    canonicalization ? `<ds:CanonicalizationMethod Algorithm="${canonicalization}"/>` : ''
  }<xades:EncapsulatedTimeStamp>${base64(token)}</xades:EncapsulatedTimeStamp></xades:SignatureTimeStamp></xades:UnsignedSignatureProperties></xades:UnsignedProperties>`;

const HASH_OIDS: Record<string, string> = {
  'SHA-1': '1.3.14.3.2.26',
  'SHA-256': '2.16.840.1.101.3.4.2.1',
  'SHA-384': '2.16.840.1.101.3.4.2.2',
  'SHA-512': '2.16.840.1.101.3.4.2.3',
};

/** An RFC 3161 token over `stamped`, from a throwaway authority. */
export async function makeTimestampToken(
  stamped: Uint8Array,
  authority: Signer,
  options: { hash?: string; hashOid?: string; constructed?: boolean } = {},
): Promise<Uint8Array> {
  const hash = options.hash ?? 'SHA-256';
  const info = new TSTInfo({
    version: 1,
    policy: '1.2.3.4',
    messageImprint: new MessageImprint({
      hashAlgorithm: new AlgorithmIdentifier({ algorithmId: options.hashOid ?? HASH_OIDS[hash], algorithmParams: new asn1js.Null() }),
      hashedMessage: new asn1js.OctetString({ valueHex: buffer(await sha(stamped, hash)) }),
    }),
    serialNumber: new asn1js.Integer({ value: 1 }),
    genTime: new Date(Date.UTC(2026, 10, 5, 10, 0, 7)),
  });

  const signed = new SignedData({
    version: 3,
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: '1.2.840.113549.1.9.16.1.4',
      ...(options.constructed ? { eContent: new asn1js.OctetString({ valueHex: info.toSchema().toBER(false) }) } : {}),
    }),
    signerInfos: [
      new SignerInfo({
        version: 1,
        sid: new IssuerAndSerialNumber({ issuer: authority.certificate.issuer, serialNumber: authority.certificate.serialNumber }),
      }),
    ],
    certificates: [authority.certificate],
  });
  // Given to the constructor it is split into a constructed string, which some
  // authorities do write and the library's own token check does not read. The
  // ordinary case sets it afterwards, to stay primitive.
  if (!options.constructed) {
    signed.encapContentInfo.eContent = new asn1js.OctetString({ valueHex: info.toSchema().toBER(false) });
  }
  await signed.sign(authority.privateKey, 0, 'SHA-256');

  return new Uint8Array(
    new ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: signed.toSchema(true) }).toSchema().toBER(false),
  );
}

/** Flip a byte near the end, which in a CMS structure is the signature value. */
export const damaged = (bytes: Uint8Array): Uint8Array => {
  const copy = bytes.slice();
  copy[copy.length - 2] ^= 0xff;
  return copy;
};

/** A detached CMS over `content`, with `bundle` listed beside the signer's certificate. */
export async function makeCades(content: Uint8Array, signer: Signer, bundle: readonly Signer[] = []): Promise<Uint8Array> {
  const signed = new SignedData({
    version: 1,
    encapContentInfo: new EncapsulatedContentInfo({ eContentType: '1.2.840.113549.1.7.1' }),
    signerInfos: [
      new SignerInfo({
        version: 1,
        sid: new IssuerAndSerialNumber({ issuer: signer.certificate.issuer, serialNumber: signer.certificate.serialNumber }),
        signedAttrs: new SignedAndUnsignedAttributes({
          type: 0,
          attributes: [
            new Attribute({ type: '1.2.840.113549.1.9.3', values: [new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.7.1' })] }),
            new Attribute({ type: '1.2.840.113549.1.9.4', values: [new asn1js.OctetString({ valueHex: buffer(await sha(content)) })] }),
            new Attribute({ type: '1.2.840.113549.1.9.5', values: [new asn1js.UTCTime({ valueDate: new Date(Date.UTC(2026, 10, 5, 10, 0, 0)) })] }),
          ],
        }),
      }),
    ],
    // Bundle first: the signer's certificate is deliberately not at the front.
    certificates: [...bundle.map((other) => other.certificate), signer.certificate],
  });
  await signed.sign(signer.privateKey, 0, 'SHA-256', buffer(content));

  return new Uint8Array(
    new ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: signed.toSchema(true) }).toSchema().toBER(false),
  );
}

/** An `ASiCManifest` listing the files and pointing at the signature over it. */
export async function makeManifest(signatureFile: string, files: Readonly<Record<string, Uint8Array>>): Promise<Uint8Array> {
  const listed = await Promise.all(
    Object.entries(files).map(
      async ([name, bytes]) =>
        `<asic:DataObjectReference URI="${encodeURIComponent(name)}"><ds:DigestMethod Algorithm="${SHA256_URI}"/><ds:DigestValue>${base64(await sha(bytes))}</ds:DigestValue></asic:DataObjectReference>`,
    ),
  );
  return utf8(
    `<?xml version="1.0" encoding="UTF-8"?><asic:ASiCManifest xmlns:asic="http://uri.etsi.org/02918/v1.2.1#" xmlns:ds="${DS_NS}"><asic:SigReference URI="${signatureFile}"/>${listed.join('')}</asic:ASiCManifest>`,
  );
}

export interface RawEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** A different name for the local header, which is what a hostile file does. */
  readonly localName?: string;
  readonly flags?: number;
  /** Lie about the unpacked size in the central directory. */
  readonly declaredSize?: number;
  /** Write the name in these bytes rather than as UTF-8. */
  readonly rawName?: Uint8Array;
  /** `bytes` is a deflate stream; this is the size to declare it unpacks to. */
  readonly deflatedSize?: number;
  /** State this CRC rather than the true one. */
  readonly crc?: number;
  /** Bytes placed after this entry that the directory does not list. */
  readonly hiddenAfter?: Uint8Array;
  /** State this unpacked size in the local header only. */
  readonly localSize?: number;
}

/**
 * A stored ZIP written byte by byte, because a library will not write the files
 * worth testing: the same name twice, or two names for one entry.
 */
export function rawZip(entries: readonly RawEntry[], options: { before?: Uint8Array; after?: Uint8Array } = {}): Uint8Array {
  const out: number[] = [...(options.before ?? [])];
  const directory: number[] = [];
  const u16 = (target: number[], value: number) => target.push(value & 0xff, (value >>> 8) & 0xff);
  const u32 = (target: number[], value: number) =>
    target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);

  for (const entry of entries) {
    const offset = out.length;
    const central = entry.rawName ?? utf8(entry.name);
    const local = entry.localName ? utf8(entry.localName) : central;
    const flags = entry.flags ?? (entry.rawName ? 0 : 0x0800);

    const size = entry.deflatedSize ?? entry.bytes.length;
    const method = entry.deflatedSize === undefined ? 0 : 8;
    const crc = entry.crc ?? (entry.deflatedSize === undefined ? crc32(entry.bytes) : 0);

    u32(out, 0x04034b50);
    u16(out, 20);
    u16(out, flags);
    u16(out, method);
    u32(out, 0);
    u32(out, crc);
    u32(out, entry.bytes.length);
    u32(out, entry.localSize ?? size);
    u16(out, local.length);
    u16(out, 0);
    out.push(...local, ...entry.bytes, ...(entry.hiddenAfter ?? []));

    u32(directory, 0x02014b50);
    u16(directory, 20);
    u16(directory, 20);
    u16(directory, flags);
    u16(directory, method);
    u32(directory, 0);
    u32(directory, crc);
    u32(directory, entry.bytes.length);
    u32(directory, entry.declaredSize ?? size);
    u16(directory, central.length);
    u16(directory, 0);
    u16(directory, 0);
    u16(directory, 0);
    u16(directory, 0);
    u32(directory, 0);
    u32(directory, offset);
    directory.push(...central);
  }

  const directoryOffset = out.length;
  out.push(...directory);
  u32(out, 0x06054b50);
  u16(out, 0);
  u16(out, 0);
  u16(out, entries.length);
  u16(out, entries.length);
  u32(out, directory.length);
  u32(out, directoryOffset);
  u16(out, 0);
  out.push(...(options.after ?? []));
  return Uint8Array.from(out);
}

/** A well-formed container from named parts, `mimetype` first. */
export function container(parts: Readonly<Record<string, Uint8Array | string>>, mediaType: string | null = ASIC_E): Uint8Array {
  const entries: RawEntry[] = mediaType ? [{ name: 'mimetype', bytes: utf8(mediaType) }] : [];
  for (const [name, value] of Object.entries(parts)) {
    entries.push({ name, bytes: typeof value === 'string' ? utf8(value) : value });
  }
  return rawZip(entries);
}

const SHA1_ID = () => new AlgorithmIdentifier({ algorithmId: '1.3.14.3.2.26', algorithmParams: new asn1js.Null() });

/** A CertID for a certificate, with its issuer's key where one is given. */
async function certIdFor(subject: Signer, issuer: Signer): Promise<CertID> {
  const key = issuer.certificate.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
  return new CertID({
    hashAlgorithm: SHA1_ID(),
    issuerNameHash: new asn1js.OctetString({ valueHex: buffer(await sha(new Uint8Array(subject.certificate.issuer.toSchema().toBER(false)), 'SHA-1')) }),
    issuerKeyHash: new asn1js.OctetString({ valueHex: buffer(await sha(new Uint8Array(key), 'SHA-1')) }),
    serialNumber: subject.certificate.serialNumber,
  });
}

/** An OCSP response about `subject`, made by `responder`. */
export async function makeOcsp(
  subject: Signer,
  responder: Signer,
  options: { status?: 'good' | 'revoked' | 'unknown'; carryResponder?: boolean; issuer?: Signer } = {},
): Promise<Uint8Array> {
  const status = options.status ?? 'good';
  const certStatus =
    status === 'good'
      ? new asn1js.Primitive({ idBlock: { tagClass: 3, tagNumber: 0 } })
      : status === 'unknown'
        ? new asn1js.Primitive({ idBlock: { tagClass: 3, tagNumber: 2 } })
        : new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 1 }, value: [new asn1js.GeneralizedTime({ valueDate: new Date(Date.UTC(2026, 0, 2)) })] });

  const basic = new BasicOCSPResponse({
    tbsResponseData: new ResponseData({
      responderID: responder.certificate.subject,
      producedAt: new Date(Date.UTC(2026, 10, 5, 10, 0, 9)),
      responses: [new SingleResponse({ certID: await certIdFor(subject, options.issuer ?? subject), certStatus, thisUpdate: new Date(Date.UTC(2026, 10, 5, 10, 0, 9)) })],
    }),
    ...(options.carryResponder === false ? {} : { certs: [responder.certificate] }),
  });
  await basic.sign(responder.privateKey, 'SHA-256');

  return new Uint8Array(
    new OCSPResponse({
      responseStatus: new asn1js.Enumerated({ value: 0 }),
      responseBytes: new ResponseBytes({
        responseType: '1.3.6.1.5.5.7.48.1.1',
        response: new asn1js.OctetString({ valueHex: basic.toSchema().toBER(false) }),
      }),
    })
      .toSchema()
      .toBER(false),
  );
}

/** A CRL from `issuer`, listing `revoked`. */
export async function makeCrl(issuer: Signer, revoked: readonly Signer[] = [], options: { delta?: boolean } = {}): Promise<Uint8Array> {
  const list = new CertificateRevocationList();
  list.version = 1;
  list.issuer = issuer.certificate.subject;
  list.thisUpdate = new Time({ type: 0, value: new Date(Date.UTC(2026, 10, 5)) });
  if (options.delta) {
    list.crlExtensions = new Extensions({
      extensions: [new Extension({ extnID: '2.5.29.27', critical: true, extnValue: new asn1js.Integer({ value: 1 }).toBER(false) })],
    });
  }
  if (revoked.length > 0) {
    list.revokedCertificates = revoked.map(
      (entry) => new RevokedCertificate({ userCertificate: entry.certificate.serialNumber, revocationDate: new Time({ type: 0, value: new Date(Date.UTC(2026, 0, 2)) }) }),
    );
  }
  await list.sign(issuer.privateKey, 'SHA-256');
  return new Uint8Array(list.toSchema(true).toBER(false));
}

/** A CRL with many entries, one of them `target`, past the parser's default node limit. */
export async function makeLargeCrl(issuer: Signer, serials: readonly number[], target: Signer): Promise<Uint8Array> {
  const list = new CertificateRevocationList();
  list.version = 1;
  list.issuer = issuer.certificate.subject;
  list.thisUpdate = new Time({ type: 0, value: new Date(Date.UTC(2026, 10, 5)) });
  const when = () => new Time({ type: 0, value: new Date(Date.UTC(2026, 0, 2)) });
  list.revokedCertificates = [
    ...serials.map((serial) => new RevokedCertificate({ userCertificate: new asn1js.Integer({ value: serial }), revocationDate: when() })),
    new RevokedCertificate({ userCertificate: target.certificate.serialNumber, revocationDate: when() }),
  ];
  await list.sign(issuer.privateKey, 'SHA-256');
  return new Uint8Array(list.toSchema(true).toBER(false));
}

/** A counter-signature `SignerInfo` over a CMS signature's value, attached to it. */
export async function addCounterSignature(der: Uint8Array, counter: Signer): Promise<Uint8Array> {
  const signed = new SignedData({ schema: ContentInfo.fromBER(buffer(der)).content });
  const parent = signed.signerInfos[0];
  const value = new Uint8Array(parent.signature.valueBlock.valueHexView);

  const attributes = [
    new Attribute({ type: '1.2.840.113549.1.9.4', values: [new asn1js.OctetString({ valueHex: buffer(await sha(value)) })] }),
    new Attribute({ type: '1.2.840.113549.1.9.5', values: [new asn1js.UTCTime({ valueDate: new Date(Date.UTC(2026, 10, 5, 10, 1, 0)) })] }),
  ];
  const encoded = new asn1js.Set({ value: attributes.map((attribute) => attribute.toSchema()) }).toBER(false);
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, counter.privateKey, encoded);

  parent.unsignedAttrs = new SignedAndUnsignedAttributes({
    type: 1,
    attributes: [
      new Attribute({
        type: '1.2.840.113549.1.9.6',
        values: [
          new SignerInfo({
            version: 1,
            sid: new IssuerAndSerialNumber({ issuer: counter.certificate.issuer, serialNumber: counter.certificate.serialNumber }),
            digestAlgorithm: new AlgorithmIdentifier({ algorithmId: '2.16.840.1.101.3.4.2.1', algorithmParams: new asn1js.Null() }),
            signedAttrs: new SignedAndUnsignedAttributes({ type: 0, attributes }),
            signatureAlgorithm: new AlgorithmIdentifier({ algorithmId: '1.2.840.113549.1.1.1', algorithmParams: new asn1js.Null() }),
            signature: new asn1js.OctetString({ valueHex: signature }),
          }).toSchema(),
        ],
      }),
    ],
  });
  signed.certificates = [...(signed.certificates ?? []), counter.certificate];

  return new Uint8Array(new ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: signed.toSchema(true) }).toSchema().toBER(false));
}
