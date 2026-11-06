import * as asn1js from 'asn1js';
import { Attribute, ContentInfo, IssuerAndSerialNumber, SignedAndUnsignedAttributes, SignedData } from 'pkijs';
import { beforeAll, describe, expect, it } from 'vitest';

import { damaged, makeCades, makeSigner, makeTimestampToken, utf8, type Signer } from './asic/fixtures.test-helper';
import { checkSigner, embeddedTimestampOf, readTimestampToken, signedDataFrom, signerCertificateOf, signerFactsOf } from './signer';

const CONTENT = utf8('the signed bytes');

const parsed = (der: Uint8Array): SignedData =>
  new SignedData({ schema: ContentInfo.fromBER(der.slice().buffer as ArrayBuffer).content });

const reparsed = (signed: SignedData): SignedData =>
  parsed(
    new Uint8Array(
      new ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: signed.toSchema(true) }).toSchema().toBER(false),
    ),
  );

let signer: Signer;
let ca: Signer;

beforeAll(async () => {
  [signer, ca] = await Promise.all([makeSigner('The Signer'), makeSigner('An Issuing CA')]);
});

describe('who signed', () => {
  it('is the certificate the SignerInfo identifies, wherever it sits in the bundle', async () => {
    // Real files list a CA or an OCSP responder first. Taking the first certificate
    // put those names on signatures.
    const signed = parsed(await makeCades(CONTENT, signer, [ca]));

    expect(signed.certificates?.length).toBe(2);
    expect((await signerFactsOf(signed)).signedBy).toBe('The Signer');
  });

  it('is found by key identifier as well as by issuer and serial', async () => {
    const signed = parsed(await makeCades(CONTENT, signer, [ca]));
    const key = signer.certificate.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
    const keyId = await crypto.subtle.digest('SHA-1', key.slice().buffer as ArrayBuffer);

    signed.signerInfos[0].sid = new asn1js.Primitive({
      idBlock: { tagClass: 3, tagNumber: 0 },
      valueHex: keyId,
    });
    const roundTripped = reparsed(signed);

    expect(roundTripped.signerInfos[0].sid).not.toBeInstanceOf(IssuerAndSerialNumber);
    expect((await signerFactsOf(roundTripped)).signedBy).toBe('The Signer');
    expect(await checkSigner(roundTripped, 0, CONTENT)).toBe('holds');
  });

  it('is nobody when the bundle does not hold the certificate it names', async () => {
    const signed = parsed(await makeCades(CONTENT, signer, [ca]));
    signed.certificates = [ca.certificate];

    expect(await signerCertificateOf(signed)).toBeNull();
    const facts = await signerFactsOf(signed);
    expect(facts.signedBy).toBeNull();
    expect(facts.certificateCount).toBe(1);
  });

  it('checks the chain from the signer, not from whichever came first', async () => {
    const signed = parsed(await makeCades(CONTENT, signer, [ca]));
    // `ca` did not issue this self-signed signer, so nothing continues the chain.
    expect((await signerFactsOf(signed)).chain).toEqual([]);
  });
});

describe('how a signature holds up', () => {
  it('reads a structure followed by the padding a PDF signature hole leaves', async () => {
    const der = await makeCades(CONTENT, signer);
    const padded = new Uint8Array(der.length + 200);
    padded.set(der);
    expect(await checkSigner(signedDataFrom(padded), 0, CONTENT)).toBe('holds');
  });

  it('tells its failures apart', async () => {
    const der = await makeCades(CONTENT, signer);

    expect(await checkSigner(parsed(der), 0, CONTENT)).toBe('holds');
    expect(await checkSigner(parsed(der), 0, utf8('other bytes'))).toBe('digest-mismatch');
    expect(await checkSigner(parsed(damaged(der)), 0, CONTENT)).toBe('bad-signature');

    const withoutCertificate = parsed(der);
    withoutCertificate.certificates = [ca.certificate];
    expect(await checkSigner(withoutCertificate, 0, CONTENT)).toBe('no-certificate');
  });
});

describe('a timestamp inside a CMS signature', () => {
  /** Attach a token built over this signature's value. */
  const stamped = async (make: (signatureValue: Uint8Array) => Promise<Uint8Array>): Promise<SignedData> => {
    const signed = parsed(await makeCades(CONTENT, signer));
    const value = new Uint8Array(signed.signerInfos[0].signature.valueBlock.valueHexView);
    const token = asn1js.fromBER((await make(value)).slice().buffer as ArrayBuffer).result;

    signed.signerInfos[0].unsignedAttrs = new SignedAndUnsignedAttributes({
      type: 1,
      attributes: [new Attribute({ type: '1.2.840.113549.1.9.16.2.14', values: [token] })],
    });
    return reparsed(signed);
  };

  it('holds when it describes this signature and verifies', async () => {
    const timestamp = await embeddedTimestampOf(await stamped((value) => makeTimestampToken(value, ca)));
    expect(timestamp?.standing).toBe('holds');
    expect(timestamp?.signedBy).toBe('An Issuing CA');
  });

  it('holds under SHA-384, which used to read as describing another signature', async () => {
    const timestamp = await embeddedTimestampOf(
      await stamped((value) => makeTimestampToken(value, ca, { hash: 'SHA-384' })),
    );
    expect(timestamp?.standing).toBe('holds');
  });

  it('is exposed when the imprint is right and nobody really signed it', async () => {
    // The attribute is unsigned, so anyone can add one. Comparing the imprint alone
    // reported a hand-made token as an authority having dated the signature.
    const timestamp = await embeddedTimestampOf(
      await stamped(async (value) => damaged(await makeTimestampToken(value, ca))),
    );
    expect(timestamp?.standing).toBe('broken');
  });

  it('reads a token whose content is a constructed string', async () => {
    // Valid BER, and written by real authorities. The library reads it as a mismatch.
    const timestamp = await embeddedTimestampOf(await stamped((value) => makeTimestampToken(value, ca, { constructed: true })));
    expect(timestamp?.standing).toBe('holds');
  });

  it('is exposed when it describes something else', async () => {
    const timestamp = await embeddedTimestampOf(await stamped(() => makeTimestampToken(utf8('elsewhere'), ca)));
    expect(timestamp?.standing).toBe('other-signature');
  });

  it('is absent when the signature carries none', async () => {
    expect(await embeddedTimestampOf(parsed(await makeCades(CONTENT, signer)))).toBeNull();
  });
});

describe('what a signature is over', () => {
  /** A CMS holding the content it signs, as a `.p7m` does. */
  const attached = async (content: Uint8Array, by: Signer) => {
    const signed = parsed(await makeCades(content, by));
    signed.encapContentInfo.eContent = new asn1js.OctetString({ valueHex: content.slice().buffer as ArrayBuffer });
    return reparsed(signed);
  };

  it('is the bytes given, not content hidden inside it', async () => {
    // The library swaps in embedded content, so a signature over one document read as covering
    // any file placed beside it.
    const signed = await attached(CONTENT, signer);
    expect(await checkSigner(signed, 0, utf8('an unrelated report'))).toBe('digest-mismatch');
    expect(await checkSigner(signed, 0, CONTENT)).toBe('holds');
  });
});

describe('the order of the checks', () => {
  it('a damaged signature over other bytes is broken, not a changed file', async () => {
    const damagedOne = parsed(damaged(await makeCades(CONTENT, signer)));
    expect(await checkSigner(damagedOne, 0, utf8('other bytes'))).toBe('bad-signature');
  });

  it('an algorithm a browser does not have says nothing either way', async () => {
    const signed = parsed(await makeCades(CONTENT, signer));
    signed.signerInfos[0].signatureAlgorithm.algorithmId = '1.3.101.112';
    expect(await checkSigner(signed, 0, CONTENT)).toBe('cannot-check');
    expect(await checkSigner(signed, 0, utf8('other bytes'))).toBe('cannot-check');
  });

  it('a digest this browser cannot compute says nothing either', async () => {
    const signed = parsed(await makeCades(CONTENT, signer));
    signed.signerInfos[0].digestAlgorithm.algorithmId = '2.16.840.1.101.3.4.2.4';
    expect(await checkSigner(signed, 0, CONTENT)).toBe('cannot-check');
  });

  it('a token that does not verify is broken, even when its imprint describes something else', async () => {
    const token = damaged(await makeTimestampToken(utf8('elsewhere'), ca));
    const read = await readTimestampToken(signedDataFrom(token), CONTENT);
    expect(read?.standing).toBe('broken');
  });
});

