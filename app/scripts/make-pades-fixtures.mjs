/**
 * Generates the PAdES fixtures used by `src/lib/pades.test.ts`.
 *
 * The M0 fixture (`scripts/make-pades-fixture.sh`) produces one PDF in the
 * easiest possible shape: a single certificate in the CMS, an
 * issuerAndSerialNumber SignerInfo, and an ASCII subject. Real qualified
 * signatures are not that tidy. This script builds the awkward shapes
 * deliberately, so the parser is tested against them before real I.CA and
 * Bank iD documents arrive rather than after.
 *
 * Everything here is dev-only: pkijs is a runtime dependency of the app, but
 * this script is never bundled, and none of these keys are secret or trusted.
 *
 *   node scripts/make-pades-fixtures.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { SignPdf } from '@signpdf/signpdf';
import { Signer } from '@signpdf/utils';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';

pkijs.setEngine('node', new pkijs.CryptoEngine({ name: 'node', crypto: webcrypto }));

const OUT = fileURLToPath(new URL('../src/lib/fixtures/', import.meta.url));

const OID = {
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  signingCertificateV1: '1.2.840.113549.1.9.16.2.12',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  signatureTimeStampToken: '1.2.840.113549.1.9.16.2.14',
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  qcStatements: '1.3.6.1.5.5.7.1.3',
  subjectKeyIdentifier: '2.5.29.14',
  keyUsage: '2.5.29.15',
  basicConstraints: '2.5.29.19',
};

const QC = {
  compliance: '0.4.0.1862.1.1',
  sscd: '0.4.0.1862.1.4',
  type: '0.4.0.1862.1.6',
  typeEsign: '0.4.0.1862.1.6.1',
};

const KEY_ALG = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

/** WebCrypto binds an RSA key to one hash, so the digest choice starts here. */
const makeKeys = (hash = 'SHA-256') =>
  webcrypto.subtle.generateKey({ ...KEY_ALG, hash }, true, ['sign', 'verify']);

const DIGEST_OID = {
  'SHA-256': '2.16.840.1.101.3.4.2.1',
  'SHA-512': '2.16.840.1.101.3.4.2.3',
};

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

/**
 * Build a certificate. `subject`/`issuer` are arrays of `[oid, value, type]`,
 * where `type` names the ASN.1 string encoding — the point of making it
 * explicit is that Czech QTSPs do not all use the same one.
 */
async function makeCertificate({ subject, issuer, serial, keys, signWith, extensions = [] }) {
  const cert = new pkijs.Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1js.Integer({ valueHex: serial });

  for (const [oid, value, type = 'Utf8String'] of subject) {
    cert.subject.typesAndValues.push(
      new pkijs.AttributeTypeAndValue({ type: oid, value: new asn1js[type]({ value }) }),
    );
  }
  for (const [oid, value, type = 'Utf8String'] of issuer) {
    cert.issuer.typesAndValues.push(
      new pkijs.AttributeTypeAndValue({ type: oid, value: new asn1js[type]({ value }) }),
    );
  }

  const now = new Date();
  cert.notBefore.value = new Date(now.getTime() - 24 * 3600 * 1000);
  cert.notAfter.value = new Date(now.getTime() + 730 * 24 * 3600 * 1000);

  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  cert.extensions = [
    extension(OID.subjectKeyIdentifier, false, new asn1js.OctetString({ valueHex: await ski(cert) })),
    ...extensions,
  ];

  await cert.sign(signWith ?? keys.privateKey, 'SHA-256');
  return cert;
}

function extension(extnID, critical, inner) {
  return new pkijs.Extension({ extnID, critical, extnValue: inner.toBER(false) });
}

/** SHA-1 of the subjectPublicKey BIT STRING contents, per RFC 5280 §4.2.1.2. */
async function ski(cert) {
  const spk = cert.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
  return await webcrypto.subtle.digest('SHA-1', spk);
}

/** `nonRepudiation` alone — the hallmark of a signing (not authentication) key. */
function nonRepudiationKeyUsage() {
  return extension(
    OID.keyUsage,
    true,
    new asn1js.BitString({ unusedBits: 6, valueHex: new Uint8Array([0x40]).buffer }),
  );
}

/**
 * ETSI EN 319 412-5 QCStatements.
 *
 * `sscd: false` mirrors what PostSignum actually issues: a genuinely qualified
 * certificate that asserts QcCompliance and QcType=esign but *not* QcSSCD. The
 * absence must not be read as "not qualified" — see `docs/qtsp-findings.md`.
 */
function qcStatementsExtension({ sscd = true } = {}) {
  const statement = (oid, ...extra) =>
    new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: oid }), ...extra] });

  const statements = [statement(QC.compliance)];
  if (sscd) statements.push(statement(QC.sscd));
  statements.push(
    statement(
      QC.type,
      new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: QC.typeEsign })] }),
    ),
  );

  return new pkijs.Extension({
    extnID: OID.qcStatements,
    critical: false,
    extnValue: new asn1js.Sequence({ value: statements }).toBER(false),
  });
}

function caExtension() {
  return extension(
    OID.basicConstraints,
    true,
    new asn1js.Sequence({ value: [new asn1js.Boolean({ value: true })] }),
  );
}

// ---------------------------------------------------------------------------
// CMS
// ---------------------------------------------------------------------------

/**
 * A @signpdf signer that builds the CMS with pkijs, so every variable the
 * parser has to cope with is under test control: which certificates are
 * bundled, how the SignerInfo names the signer, and which signed attributes
 * are present.
 */
class PkijsSigner extends Signer {
  /**
   * @param {object} o
   * @param {import('pkijs').Certificate} o.signerCert
   * @param {CryptoKey} o.privateKey
   * @param {import('pkijs').Certificate[]} o.bundle  certificates to embed
   * @param {'issuerAndSerial'|'subjectKeyIdentifier'} o.sid  how to name the signer
   * @param {boolean} [o.withSigningCertificateV2]
   */
  constructor(o) {
    super();
    this.o = o;
    /** Set after `sign()` — the DER actually embedded, for assertions. */
    this.lastCms = null;
  }

  async sign(pdfBuffer, signingTime = new Date()) {
    const {
      signerCert,
      privateKey,
      bundle,
      sid,
      signingCertificateAttr = 'v2',
      withSigningTime = true,
      digest: digestName = 'SHA-256',
      timestamp = null,
    } = this.o;

    const digest = await webcrypto.subtle.digest(digestName, pdfBuffer);

    const attributes = [
      new pkijs.Attribute({
        type: OID.contentType,
        values: [new asn1js.ObjectIdentifier({ value: OID.data })],
      }),
      new pkijs.Attribute({
        type: OID.messageDigest,
        values: [new asn1js.OctetString({ valueHex: digest })],
      }),
    ];

    // Optional per RFC 5652, and genuinely absent from real QTSP output when an
    // RFC 3161 token is attached — the token is the better time.
    if (withSigningTime) {
      attributes.push(
        new pkijs.Attribute({
          type: OID.signingTime,
          values: [new asn1js.UTCTime({ valueDate: signingTime })],
        }),
      );
    }

    if (signingCertificateAttr === 'v2') {
      const certHash = await webcrypto.subtle.digest('SHA-256', signerCert.toSchema().toBER(false));
      attributes.push(
        new pkijs.Attribute({
          type: OID.signingCertificateV2,
          // SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }
          // ESSCertIDv2 ::= SEQUENCE { hashAlgorithm DEFAULT sha256, certHash }
          values: [essCertsAttribute(certHash)],
        }),
      );
    } else if (signingCertificateAttr === 'v1') {
      // RFC 2634 ESSCertID — SHA-1 certHash, no algorithm identifier. Still
      // emitted by PostSignum, so the parser must accept it as binding.
      const certHash = await webcrypto.subtle.digest('SHA-1', signerCert.toSchema().toBER(false));
      attributes.push(
        new pkijs.Attribute({
          type: OID.signingCertificateV1,
          values: [essCertsAttribute(certHash)],
        }),
      );
    }

    const useSki = sid === 'subjectKeyIdentifier';
    const signerInfo = new pkijs.SignerInfo({
      // CMS requires version 3 when the signer is named by key identifier.
      version: useSki ? 3 : 1,
      sid: useSki
        ? // RFC 5652: SignerIdentifier ::= CHOICE { ..., subjectKeyIdentifier
          // [0] SubjectKeyIdentifier }. The CMS module uses IMPLICIT tags, so
          // this is a primitive context-0 holding the raw key identifier — not
          // a re-tagged OCTET STRING, which OpenSSL rejects outright.
          new asn1js.Primitive({
            idBlock: { tagClass: 3, tagNumber: 0 },
            valueHex: await ski(signerCert),
          })
        : new pkijs.IssuerAndSerialNumber({
            issuer: signerCert.issuer,
            serialNumber: signerCert.serialNumber,
          }),
      signedAttrs: new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes }),
    });

    const signedData = new pkijs.SignedData({
      version: useSki ? 3 : 1,
      encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: OID.data }),
      signerInfos: [signerInfo],
      certificates: bundle,
    });
    await signedData.sign(privateKey, 0, digestName);

    // PAdES-T. The token is issued over the signature value, so it can only be
    // built after signing — which is fine, because unsigned attributes are by
    // definition outside what the signature covers.
    if (timestamp) {
      const token = await timestampToken(
        new Uint8Array(signerInfo.signature.valueBlock.valueHexView),
        timestamp,
      );
      signerInfo.unsignedAttrs = new pkijs.SignedAndUnsignedAttributes({
        type: 1,
        attributes: [
          new pkijs.Attribute({ type: OID.signatureTimeStampToken, values: [token] }),
        ],
      });
    }

    const cms = new pkijs.ContentInfo({
      contentType: OID.signedData,
      content: signedData.toSchema(true),
    });
    this.lastCms = Buffer.from(cms.toSchema().toBER(false));
    return this.lastCms;
  }
}

/** ESS `certs SEQUENCE OF ESSCertID[v2]`, with every optional field omitted. */
function essCertsAttribute(certHash) {
  return new asn1js.Sequence({
    value: [
      new asn1js.Sequence({
        value: [new asn1js.Sequence({ value: [new asn1js.OctetString({ valueHex: certHash })] })],
      }),
    ],
  });
}

/**
 * An RFC 3161 timestamp token over `signatureBytes`, as a TSA would issue it:
 * CMS SignedData whose encapsulated content is a TSTInfo, signed by a separate
 * timestamping certificate that travels inside the token.
 *
 * @param {Uint8Array} signatureBytes  the signature value being timestamped
 * @param {{ tsaCert: import('pkijs').Certificate, tsaKey: CryptoKey,
 *           digest?: string, genTime?: Date, imprintOver?: Uint8Array }} o
 */
async function timestampToken(signatureBytes, o) {
  const { tsaCert, tsaKey, digest = 'SHA-256', genTime = new Date() } = o;

  // `imprintOver` lets a fixture timestamp the wrong bytes on purpose.
  const imprint = await webcrypto.subtle.digest(digest, o.imprintOver ?? signatureBytes);

  const tstInfo = new pkijs.TSTInfo({
    version: 1,
    policy: '1.3.6.1.4.1.99999.1.1',
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({
        algorithmId: DIGEST_OID[digest],
        algorithmParams: new asn1js.Null(),
      }),
      hashedMessage: new asn1js.OctetString({ valueHex: imprint }),
    }),
    serialNumber: new asn1js.Integer({ value: Math.floor(Math.random() * 1e9) }),
    genTime,
  });

  const eContent = tstInfo.toSchema().toBER(false);
  const signerInfo = new pkijs.SignerInfo({
    version: 1,
    sid: new pkijs.IssuerAndSerialNumber({
      issuer: tsaCert.issuer,
      serialNumber: tsaCert.serialNumber,
    }),
    signedAttrs: new pkijs.SignedAndUnsignedAttributes({
      type: 0,
      attributes: [
        new pkijs.Attribute({
          type: OID.contentType,
          values: [new asn1js.ObjectIdentifier({ value: OID.tstInfo })],
        }),
        new pkijs.Attribute({
          type: OID.messageDigest,
          values: [
            new asn1js.OctetString({
              valueHex: await webcrypto.subtle.digest('SHA-256', eContent),
            }),
          ],
        }),
      ],
    }),
  });

  const token = new pkijs.SignedData({
    version: 3,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({
      eContentType: OID.tstInfo,
      eContent: new asn1js.OctetString({ valueHex: eContent }),
    }),
    signerInfos: [signerInfo],
    certificates: [tsaCert],
  });
  await token.sign(tsaKey, 0, 'SHA-256');

  return new pkijs.ContentInfo({
    contentType: OID.signedData,
    content: token.toSchema(true),
  }).toSchema();
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

async function placeholderPdf(title, signerName) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 300]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('xNotary PAdES parser fixture', { x: 40, y: 240, size: 16, font });
  // Latin-1 only: StandardFonts.Helvetica cannot draw Czech diacritics, and the
  // page text is irrelevant to the parser anyway — the identity under test
  // lives in the certificate.
  page.drawText(title, { x: 40, y: 210, size: 10, font });

  pdflibAddPlaceholder({
    pdfDoc: pdf,
    reason: 'I attest to Certificate 1',
    contactInfo: 'fixtures@example.invalid',
    name: signerName,
    location: 'Praha, CZ',
    signatureLength: 8192,
  });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function write(name, bytes, note) {
  writeFileSync(new URL(name, `file://${OUT}`), bytes);
  console.log(`  ${name.padEnd(28)} ${String(bytes.length).padStart(6)} bytes — ${note}`);
}

// ---------------------------------------------------------------------------

const CA_DN = [
  ['2.5.4.6', 'CZ', 'PrintableString'],
  ['2.5.4.10', 'xNotary Test QTSP a.s.'],
  ['2.5.4.3', 'xNotary Test Qualified CA 2/RSA 02/2026'],
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log('Generating PAdES fixtures into src/lib/fixtures/\n');

  const caKeys = await webcrypto.subtle.generateKey(KEY_ALG, true, ['sign', 'verify']);
  const ca = await makeCertificate({
    subject: CA_DN,
    issuer: CA_DN,
    serial: new Uint8Array([0x01]).buffer,
    keys: caKeys,
    extensions: [caExtension()],
  });

  // The leaf's serial. Deliberately reused by the decoy certificate below.
  const SHARED_SERIAL = new Uint8Array([0x42, 0x13, 0x37]).buffer;

  const leafKeys = await webcrypto.subtle.generateKey(KEY_ALG, true, ['sign', 'verify']);
  const leaf = await makeCertificate({
    subject: [
      ['2.5.4.6', 'CZ', 'PrintableString'],
      ['2.5.4.10', 'xNotary Test QTSP a.s.'],
      ['2.5.4.3', 'Jan Novak'],
      ['2.5.4.5', 'ICA - 10123456', 'PrintableString'],
    ],
    issuer: CA_DN,
    serial: SHARED_SERIAL,
    keys: leafKeys,
    signWith: caKeys.privateKey,
    extensions: [nonRepudiationKeyUsage(), qcStatementsExtension()],
  });

  const signPdf = new SignPdf();

  // 1. Signer named by subjectKeyIdentifier, full chain bundled.
  //    The common real-world shape that the M0 fixture never exercised.
  await write(
    'chain-ski.pdf',
    await signPdf.sign(
      await placeholderPdf('SignerInfo names the signer by subjectKeyIdentifier', 'Jan Novak'),
      new PkijsSigner({
        signerCert: leaf,
        privateKey: leafKeys.privateKey,
        bundle: [leaf, ca],
        sid: 'subjectKeyIdentifier',
      }),
    ),
    'SKI SignerInfo, leaf + CA bundled',
  );

  // 2. issuerAndSerialNumber, with a decoy certificate carrying the SAME serial
  //    under a different issuer. Serial numbers are unique per issuer, not
  //    globally, so matching on serial alone picks the wrong certificate here.
  const decoyKeys = await webcrypto.subtle.generateKey(KEY_ALG, true, ['sign', 'verify']);
  const decoyIssuerDn = [
    ['2.5.4.6', 'CZ', 'PrintableString'],
    ['2.5.4.10', 'Unrelated CA s.r.o.'],
    ['2.5.4.3', 'Unrelated Issuing CA'],
  ];
  const decoy = await makeCertificate({
    subject: [
      ['2.5.4.6', 'CZ', 'PrintableString'],
      ['2.5.4.3', 'Someone Else'],
    ],
    issuer: decoyIssuerDn,
    serial: SHARED_SERIAL,
    keys: decoyKeys,
  });

  await write(
    'serial-collision.pdf',
    await signPdf.sign(
      await placeholderPdf('Bundle contains a decoy cert with the same serial', 'Jan Novak'),
      new PkijsSigner({
        signerCert: leaf,
        privateKey: leafKeys.privateKey,
        // Decoy first, so a serial-only match finds it before the real signer.
        bundle: [decoy, leaf, ca],
        sid: 'issuerAndSerial',
      }),
    ),
    'decoy shares the leaf serial',
  );

  // 3. Czech diacritics, with the identity split across givenName/surname and a
  //    CN that carries the serial the way several QTSPs format it.
  const utf8Keys = await webcrypto.subtle.generateKey(KEY_ALG, true, ['sign', 'verify']);
  const utf8Leaf = await makeCertificate({
    subject: [
      ['2.5.4.6', 'CZ', 'PrintableString'],
      ['2.5.4.10', 'xNotary Test QTSP a.s.'],
      ['2.5.4.3', 'Jiří Dvořák 10123456'],
      ['2.5.4.42', 'Jiří'],
      ['2.5.4.4', 'Dvořák'],
      ['2.5.4.5', 'ICA - 10123456', 'PrintableString'],
    ],
    issuer: CA_DN,
    serial: new Uint8Array([0x02]).buffer,
    keys: utf8Keys,
    signWith: caKeys.privateKey,
    extensions: [nonRepudiationKeyUsage(), qcStatementsExtension()],
  });

  await write(
    'diacritics-utf8.pdf',
    await signPdf.sign(
      await placeholderPdf('Subject DN carries Czech diacritics as UTF8String', 'Jiri Dvorak'),
      new PkijsSigner({
        signerCert: utf8Leaf,
        privateKey: utf8Keys.privateKey,
        bundle: [utf8Leaf, ca],
        sid: 'issuerAndSerial',
      }),
    ),
    'UTF8String DN, GN/SN split',
  );

  // 3b. The same identity as BMPString. Older Czech certificates use it, and it
  //     decodes differently enough to be worth pinning.
  const bmpKeys = await webcrypto.subtle.generateKey(KEY_ALG, true, ['sign', 'verify']);
  const bmpLeaf = await makeCertificate({
    subject: [
      ['2.5.4.6', 'CZ', 'PrintableString'],
      ['2.5.4.10', 'xNotary Test QTSP a.s.'],
      ['2.5.4.3', 'Jiří Dvořák', 'BmpString'],
    ],
    issuer: CA_DN,
    serial: new Uint8Array([0x03]).buffer,
    keys: bmpKeys,
    signWith: caKeys.privateKey,
    extensions: [nonRepudiationKeyUsage(), qcStatementsExtension()],
  });

  await write(
    'diacritics-bmp.pdf',
    await signPdf.sign(
      await placeholderPdf('Subject CN is a BMPString', 'Jiri Dvorak'),
      new PkijsSigner({
        signerCert: bmpLeaf,
        privateKey: bmpKeys.privateKey,
        bundle: [bmpLeaf, ca],
        sid: 'issuerAndSerial',
      }),
    ),
    'BMPString CN',
  );

  // 4. A CMS whose DER happens to end in 0x00.
  //
  //    @signpdf pads the /Contents placeholder with NUL bytes, so a parser that
  //    strips trailing zeroes to remove the padding will also eat a real
  //    trailing zero and truncate the DER. The last byte of the RSA signature is
  //    effectively random, so search for a signing time that produces one.
  let trailingZero = null;
  for (let attempt = 0; attempt < 4096 && !trailingZero; attempt++) {
    const signer = new PkijsSigner({
      signerCert: leaf,
      privateKey: leafKeys.privateKey,
      bundle: [leaf, ca],
      sid: 'issuerAndSerial',
    });
    const pdf = await signPdf.sign(
      await placeholderPdf('CMS DER ends in a real 0x00 byte', 'Jan Novak'),
      signer,
      new Date(Date.now() - attempt * 1000),
    );
    if (signer.lastCms[signer.lastCms.length - 1] === 0x00) {
      trailingZero = { pdf, attempt };
    }
  }
  if (!trailingZero) throw new Error('No signing time produced a CMS ending in 0x00');
  await write(
    'der-trailing-zero.pdf',
    trailingZero.pdf,
    `CMS ends in 0x00 (found after ${trailingZero.attempt + 1} attempts)`,
  );

  // 5. The shape a real PostSignum qualified signature actually has, as
  //    observed on a genuine signed document (see docs/qtsp-findings.md):
  //    SHA-512, ESS signing-certificate v1, NO signingTime attribute at all,
  //    a single certificate in the CMS, an RFC 3161 token from a third-party
  //    TSA, and QCStatements without QcSSCD.
  const tsaKeys = await makeKeys();
  const tsa = await makeCertificate({
    subject: [
      ['2.5.4.6', 'US', 'PrintableString'],
      ['2.5.4.10', 'Example Timestamping, Inc.'],
      ['2.5.4.3', 'Example SHA512 RSA4096 Timestamp Responder 2026 1'],
    ],
    issuer: CA_DN,
    serial: new Uint8Array([0x04]).buffer,
    keys: tsaKeys,
    signWith: caKeys.privateKey,
  });

  const qtspKeys = await makeKeys('SHA-512');
  const qtspLeaf = await makeCertificate({
    subject: [
      ['2.5.4.6', 'CZ', 'PrintableString'],
      ['2.5.4.3', 'Milan Novák'],
      ['2.5.4.4', 'Novák'],
      ['2.5.4.42', 'Milan'],
      ['2.5.4.5', 'P123456', 'PrintableString'],
    ],
    issuer: CA_DN,
    serial: new Uint8Array([0x05]).buffer,
    keys: qtspKeys,
    signWith: caKeys.privateKey,
    extensions: [nonRepudiationKeyUsage(), qcStatementsExtension({ sscd: false })],
  });

  const qtspOptions = {
    signerCert: qtspLeaf,
    privateKey: qtspKeys.privateKey,
    // A single certificate, as PostSignum ships — the chain is not bundled.
    bundle: [qtspLeaf],
    sid: 'issuerAndSerial',
    signingCertificateAttr: 'v1',
    withSigningTime: false,
    digest: 'SHA-512',
  };

  await write(
    'qtsp-shape.pdf',
    await signPdf.sign(
      await placeholderPdf('The shape a real PostSignum signature has', 'Milan Novak'),
      new PkijsSigner({
        ...qtspOptions,
        timestamp: { tsaCert: tsa, tsaKey: tsaKeys.privateKey },
      }),
    ),
    'SHA-512, signing-cert v1, no signingTime, RFC 3161 token',
  );

  // 6. The same, but the TSA timestamped something else. A token proves a time
  //    only if its imprint is over this signature's bytes; one lifted from
  //    another document must not be reported as this signature's time.
  await write(
    'timestamp-foreign.pdf',
    await signPdf.sign(
      await placeholderPdf('Timestamp token issued over unrelated bytes', 'Milan Novak'),
      new PkijsSigner({
        ...qtspOptions,
        timestamp: {
          tsaCert: tsa,
          tsaKey: tsaKeys.privateKey,
          imprintOver: new TextEncoder().encode('bytes from a different document'),
        },
      }),
    ),
    'token imprint does not cover the signature',
  );

  console.log('\nDone. These certificates are self-generated and trusted by nobody.');
}

await main();
