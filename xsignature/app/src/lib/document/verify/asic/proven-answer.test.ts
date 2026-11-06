import * as asn1js from 'asn1js';
import { Certificate, Extension, ExtKeyUsage } from 'pkijs';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildDirectory, type DirectorySource } from '../../certificate/read/directory';
import { certificateIssuedBy, makeCrl, makeOcsp, makeSigner, type Signer } from './fixtures.test-helper';
import { proveAnswer } from './proven-answer';
import { revocationOf } from './revocation';

const OCSP_SIGNING = '1.3.6.1.5.5.7.3.9';
const nowhere: DirectorySource = async () => null;

let issuer: Signer;
let signer: Signer;

beforeAll(async () => {
  issuer = await makeSigner('Issuing CA');
  signer = await certificateIssuedBy('The Signer', await makeSigner('keys'), issuer);
});

/** A certificate issued by `by`, optionally for OCSP signing. */
async function responderCertificate(name: string, by: Signer, forOcsp = true): Promise<Signer> {
  const keys = await makeSigner('keys');
  const certificate = new Certificate();
  certificate.version = 2;
  certificate.serialNumber = new asn1js.Integer({ value: 77 });
  certificate.issuer = by.certificate.subject;
  certificate.subject = (await makeSigner(name)).certificate.subject;
  certificate.notBefore.value = new Date(Date.UTC(2020, 0, 1));
  certificate.notAfter.value = new Date(Date.UTC(2039, 0, 1));
  if (forOcsp) {
    const usage = new ExtKeyUsage({ keyPurposes: [OCSP_SIGNING] });
    certificate.extensions = [
      new Extension({ extnID: '2.5.29.37', extnValue: usage.toSchema().toBER(false), parsedValue: usage }),
    ];
  }
  await certificate.subjectPublicKeyInfo.importKey(keys.publicKey);
  await certificate.sign(by.privateKey, 'SHA-256');
  const der = new Uint8Array(certificate.toSchema().toBER(false));
  return { ...keys, certificate: Certificate.fromBER(der.slice().buffer as ArrayBuffer), der };
}

const answered = async (by: Signer, options = {}) =>
  (await revocationOf(signer.certificate, [issuer.certificate], { ocsp: [await makeOcsp(signer, by, { issuer, ...options })], crl: [] }))!;

describe('an answer that could only have come from the right party', () => {
  it('the issuer itself, by key', async () => {
    expect(await proveAnswer(await answered(issuer), issuer.certificate, null, nowhere)).toBe('issuer');
  });

  it('a responder the issuer certified for OCSP signing', async () => {
    const responder = await responderCertificate('OCSP Responder', issuer);
    expect(await proveAnswer(await answered(responder), issuer.certificate, null, nowhere)).toBe('delegated');
  });

  it('a CRL signed with the issuer\'s key', async () => {
    const answer = (await revocationOf(signer.certificate, [issuer.certificate], { ocsp: [], crl: [await makeCrl(issuer)] }))!;
    expect(await proveAnswer(answer, issuer.certificate, null, nowhere)).toBe('issuer');
  });

  it('a responder a verified list records, under the same provider', async () => {
    const responder = await makeSigner('Listed Responder');
    const provider = { n: ['Provider'], h: [{ s: 'granted', t: '2020-01-01T00:00:00Z' }] };
    const { shards } = await buildDirectory([{ der: responder.der, tl: 'SK', responderServices: [provider] }], 'x');
    const source = (async (name: string) => shards[name] ?? null) as DirectorySource;
    const stranger = await makeSigner('Some Issuer');
    expect(await proveAnswer(await answered(responder), stranger.certificate, { list: 'SK', services: [provider] }, source)).toBe('listed');
  });
});

describe('what anyone could have added', () => {
  it('a self-made responder', async () => {
    const forged = await makeSigner('OCSP Responder');
    expect(await proveAnswer(await answered(forged), issuer.certificate, null, nowhere)).toBeNull();
  });

  it('a self-made responder naming the issuer, with another key', async () => {
    const forged = await makeSigner('Issuing CA');
    expect(await proveAnswer(await answered(forged), issuer.certificate, null, nowhere)).toBeNull();
  });

  it('a certificate from the same issuer, not certified for OCSP', async () => {
    // Anyone holding any certificate from this authority must not be able to answer for it.
    const ordinary = await responderCertificate('Another Customer', issuer, false);
    expect(await proveAnswer(await answered(ordinary), issuer.certificate, null, nowhere)).toBeNull();
  });

  it('a responder certified by another authority', async () => {
    const other = await makeSigner('Another CA');
    const responder = await responderCertificate('OCSP Responder', other);
    expect(await proveAnswer(await answered(responder), issuer.certificate, null, nowhere)).toBeNull();
  });

  it('a CRL signed by anyone but the issuer', async () => {
    const forged = await makeSigner('Issuing CA');
    const answer = (await revocationOf(signer.certificate, [forged.certificate], { ocsp: [], crl: [await makeCrl(forged)] }))!;
    expect(answer.standing).toBe('holds');
    expect(await proveAnswer(answer, issuer.certificate, null, nowhere)).toBeNull();
  });

  it('with no issuer established, nothing can be proven', async () => {
    expect(await proveAnswer(await answered(issuer), null, null, nowhere)).toBeNull();
  });
});

describe('a listed responder that does not qualify', () => {
  const provider = { n: ['Provider'], h: [{ s: 'granted', t: '2020-01-01T00:00:00Z' }] };
  const stranger = () => makeSigner('Some Issuer');

  const sourceFor = async (der: Uint8Array, tl: string, service: typeof provider) => {
    const { shards } = await buildDirectory([{ der, tl, responderServices: [service] }], 'x');
    return (async (name: string) => shards[name] ?? null) as DirectorySource;
  };

  it('on another country\'s list', async () => {
    const responder = await makeSigner('R');
    const source = await sourceFor(responder.der, 'CZ', provider);
    expect(await proveAnswer(await answered(responder), (await stranger()).certificate, { list: 'SK', services: [provider] }, source)).toBeNull();
  });

  it('under another provider', async () => {
    const responder = await makeSigner('R');
    const source = await sourceFor(responder.der, 'SK', { ...provider, n: ['Someone Else'] });
    expect(await proveAnswer(await answered(responder), (await stranger()).certificate, { list: 'SK', services: [provider] }, source)).toBeNull();
  });

  it('withdrawn when it answered', async () => {
    const responder = await makeSigner('R');
    const source = await sourceFor(responder.der, 'SK', { ...provider, h: [{ s: 'withdrawn', t: '2020-01-01T00:00:00Z' }] });
    expect(await proveAnswer(await answered(responder), (await stranger()).certificate, { list: 'SK', services: [provider] }, source)).toBeNull();
  });

  it('a certificate copying a listed responder\'s name, with another key', async () => {
    const responder = await makeSigner('R');
    const copy = await makeSigner('R');
    const source = await sourceFor(responder.der, 'SK', provider);
    expect(await proveAnswer(await answered(copy), (await stranger()).certificate, { list: 'SK', services: [provider] }, source)).toBeNull();
  });
});
