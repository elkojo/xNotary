import * as asn1js from 'asn1js';
import { Certificate, Extension, ExtKeyUsage } from 'pkijs';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildDirectory, type DirectorySource } from '../../certificate/read/directory';
import { certificateIssuedBy, makeCrl, makeOcsp, makeSigner, type Signer } from './fixtures.test-helper';
import { DirectoryUnreachable } from '../../certificate/read/directory';
import { chooseCarried, judgeNotRevoked, proveAnswer, proveCarried, type CarriedAnswer } from './proven-answer';
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
    expect(await proveAnswer(await answered(responder), issuer.certificate, { list: 'SK', services: [provider] }, source)).toBe('listed');
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

  const sourceFor = async (der: Uint8Array, tl: string, service: typeof provider) => {
    const { shards } = await buildDirectory([{ der, tl, responderServices: [service] }], 'x');
    return (async (name: string) => shards[name] ?? null) as DirectorySource;
  };

  it('on another country\'s list', async () => {
    const responder = await makeSigner('R');
    const source = await sourceFor(responder.der, 'CZ', provider);
    expect(await proveAnswer(await answered(responder), issuer.certificate, { list: 'SK', services: [provider] }, source)).toBeNull();
  });

  it('under another provider', async () => {
    const responder = await makeSigner('R');
    const source = await sourceFor(responder.der, 'SK', { ...provider, n: ['Someone Else'] });
    expect(await proveAnswer(await answered(responder), issuer.certificate, { list: 'SK', services: [provider] }, source)).toBeNull();
  });

  it('withdrawn when it answered', async () => {
    const responder = await makeSigner('R');
    const source = await sourceFor(responder.der, 'SK', { ...provider, h: [{ s: 'withdrawn', t: '2020-01-01T00:00:00Z' }] });
    expect(await proveAnswer(await answered(responder), issuer.certificate, { list: 'SK', services: [provider] }, source)).toBeNull();
  });

  it('a certificate copying a listed responder\'s name, with another key', async () => {
    const responder = await makeSigner('R');
    const copy = await makeSigner('R');
    const source = await sourceFor(responder.der, 'SK', provider);
    expect(await proveAnswer(await answered(copy), issuer.certificate, { list: 'SK', services: [provider] }, source)).toBeNull();
  });
});

describe('an answer about another key of the same authority', () => {
  it('does not speak for this certificate, even from the issuer', async () => {
    // A re-keyed authority: one name, two keys. The response names the old one.
    const rekeyed = await makeSigner('Issuing CA');
    const der = await makeOcsp(signer, rekeyed, { issuer });
    const answer = (await revocationOf(signer.certificate, [issuer.certificate], { ocsp: [der], crl: [] }))!;
    expect(answer.standing).toBe('holds');
    expect(await proveAnswer(answer, rekeyed.certificate, null, nowhere)).toBeNull();
  });
});

describe('what an answer can speak for', () => {
  const independent = { time: new Date('2026-11-05T09:00:00Z'), independent: true };
  const late = new Date('2026-11-05T10:00:00Z');

  it('reads the status time apart from when the response was given', async () => {
    const answer = await answered(issuer, { thisUpdate: new Date('2026-01-01T00:00:00Z') });
    expect(answer.at?.toISOString()).toBe('2026-11-05T10:00:09.000Z');
    expect(answer.statusAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('a response given after the signature, about a moment before it, settles nothing', async () => {
    const answer = await answered(issuer, { thisUpdate: new Date('2026-11-05T08:59:59Z') });
    expect(answer.at!.getTime()).toBeGreaterThan(independent.time.getTime());
    expect(judgeNotRevoked(answer, independent, signer.certificate)).toBe('before-signature');
  });

  it('a status from after a confirmed time settles it', async () => {
    expect(judgeNotRevoked(await answered(issuer, { thisUpdate: late }), independent, signer.certificate)).toBe('settles');
  });

  it('with no independent time it settles nothing', async () => {
    expect(judgeNotRevoked(await answered(issuer), { ...independent, independent: false }, signer.certificate)).toBe('undated');
  });

  it('after the certificate expired, an authority need no longer track it', async () => {
    const expiry = signer.certificate.notAfter.value;
    const after = new Date(expiry.getTime() + 1000);
    expect(judgeNotRevoked(await answered(issuer, { thisUpdate: after }), independent, signer.certificate)).toBe('after-expiry');
  });

  it('it is no judgement of a "revoked"', async () => {
    expect(judgeNotRevoked(await answered(issuer, { status: 'revoked' }), independent, signer.certificate)).toBeNull();
  });
});

describe('several answers side by side', () => {
  const evidence = async (ocsp: Uint8Array[], crl: Uint8Array[] = [], certificates = [issuer.certificate]) => ({ embedded: { ocsp, crl }, certificates });
  const settles = () => true;

  it('a forged "revoked" cannot hide a proven answer', async () => {
    const forged = await makeSigner('OCSP Responder');
    const { answers } = await proveCarried(
      signer.certificate,
      await evidence([await makeOcsp(signer, forged, { issuer, status: 'revoked' }), await makeOcsp(signer, issuer, { issuer })]),
      issuer.certificate,
      null,
      nowhere,
    );
    expect(answers).toHaveLength(2);
    expect(answers[0].answer.status).toBe('revoked');
    expect(answers[0].proof).toBeNull();
    expect(chooseCarried(answers, settles)).toMatchObject({ proof: 'issuer', answer: { status: 'good' } });
  });

  it('a proven "revoked" outranks a proven "not revoked"', async () => {
    const { answers } = await proveCarried(
      signer.certificate,
      await evidence([await makeOcsp(signer, issuer, { issuer }), await makeOcsp(signer, issuer, { issuer, status: 'revoked' })]),
      issuer.certificate,
      null,
      nowhere,
    );
    expect(chooseCarried(answers, settles)).toMatchObject({ proof: 'issuer', answer: { status: 'revoked' } });
  });

  it('prefers the proven answer that settles it over a newer one that does not', () => {
    const answer = (statusAt: string) => ({ status: 'good', statusAt: new Date(statusAt) }) as CarriedAnswer['answer'];
    const older = { answer: answer('2026-01-01T00:00:00Z'), proof: 'issuer' } as const;
    const newer = { answer: answer('2026-06-01T00:00:00Z'), proof: 'issuer' } as const;
    expect(chooseCarried([newer, older], (candidate) => candidate === older.answer)).toBe(older);
  });

  it('a proven answer that settles nothing does not hide a worse one', async () => {
    const forged = await makeSigner('OCSP Responder');
    const { answers } = await proveCarried(
      signer.certificate,
      await evidence([await makeOcsp(signer, forged, { issuer, status: 'revoked' }), await makeOcsp(signer, issuer, { issuer })]),
      issuer.certificate,
      null,
      nowhere,
    );
    expect(chooseCarried(answers, () => false)).toMatchObject({ proof: null, answer: { status: 'revoked' } });
  });

  it('with nothing proven, the worst is reported, unproven', async () => {
    const forged = await makeSigner('OCSP Responder');
    const { answers } = await proveCarried(
      signer.certificate,
      await evidence([await makeOcsp(signer, forged, { issuer, status: 'revoked' })]),
      issuer.certificate,
      null,
      nowhere,
    );
    expect(chooseCarried(answers, settles)).toMatchObject({ proof: null, answer: { status: 'revoked' } });
  });

  it('a list that could not be read at first is proven once the issuer is known', async () => {
    const carried = await evidence([], [await makeCrl(issuer)], []);
    const before = await proveCarried(signer.certificate, carried, null, null, nowhere);
    expect(before.answers[0]).toMatchObject({ proof: null, answer: { standing: 'cannot-check' } });
    const after = await proveCarried(signer.certificate, carried, issuer.certificate, null, nowhere);
    expect(after.answers[0]).toMatchObject({ proof: 'issuer', answer: { standing: 'holds' } });
  });

  it('an unreachable directory keeps what is already proven, and says so', async () => {
    const responder = await makeSigner('Maybe Listed');
    const down: DirectorySource = async () => {
      throw new DirectoryUnreachable('down');
    };
    const { answers, unreachable } = await proveCarried(
      signer.certificate,
      await evidence([await makeOcsp(signer, responder, { issuer }), await makeOcsp(signer, issuer, { issuer })]),
      issuer.certificate,
      { list: 'SK', services: [{ n: ['P'], h: [{ s: 'granted', t: '2020-01-01T00:00:00Z' }] }] },
      down,
    );
    expect(unreachable).toBe(true);
    expect(chooseCarried(answers, settles)?.proof).toBe('issuer');
  });

  it('with the directory unreachable, a "revoked" nobody could judge outranks a proven "not revoked"', async () => {
    const responder = await makeSigner('Maybe Listed');
    const down: DirectorySource = async () => {
      throw new DirectoryUnreachable('down');
    };
    const { answers } = await proveCarried(
      signer.certificate,
      await evidence([await makeOcsp(signer, responder, { issuer, status: 'revoked' }), await makeOcsp(signer, issuer, { issuer })]),
      issuer.certificate,
      { list: 'SK', services: [{ n: ['P'], h: [{ s: 'granted', t: '2020-01-01T00:00:00Z' }] }] },
      down,
    );
    expect(chooseCarried(answers, settles)).toMatchObject({ proof: null, unjudged: true, answer: { status: 'revoked' } });
  });
});

describe('standing when it answered', () => {
  const granted = (t: string) => ({ list: 'SK', services: [{ n: ['Provider'], h: [{ s: 'granted', t }] }] });

  it('an answer describing a moment after it was made proves nothing', async () => {
    const answer = await answered(issuer, { thisUpdate: new Date('2027-01-01T00:00:00Z') });
    expect(answer.statusAt!.getTime()).toBeGreaterThan(answer.at!.getTime());
    expect(await proveAnswer(answer, issuer.certificate, null, nowhere)).toBeNull();
  });

  it('an issuer past its dates proves nothing, with its own key or through a responder', async () => {
    const after = new Date(issuer.certificate.notAfter.value.getTime() + 1000);
    const own = { ...(await answered(issuer)), at: after, statusAt: after };
    expect(await proveAnswer(own, issuer.certificate, null, nowhere)).toBeNull();
    const responder = await responderCertificate('OCSP Responder', issuer);
    const delegated = { ...(await answered(responder)), at: after, statusAt: after };
    expect(await proveAnswer(delegated, issuer.certificate, null, nowhere)).toBeNull();
  });

  it('an issuer withdrawn from its list by then proves nothing', async () => {
    const withdrawn = { list: 'SK', services: [{ n: ['Provider'], h: [{ s: 'withdrawn', t: '2020-01-01T00:00:00Z' }] }] };
    expect(await proveAnswer(await answered(issuer), issuer.certificate, withdrawn, nowhere)).toBeNull();
    expect(await proveAnswer(await answered(issuer), issuer.certificate, granted('2020-01-01T00:00:00Z'), nowhere)).toBe('issuer');
    // Lists before 2016 say the same thing in other words.
    const older = { list: 'SK', services: [{ n: ['Provider'], h: [{ s: 'undersupervision', t: '2010-01-01T00:00:00Z' }] }] };
    expect(await proveAnswer(await answered(issuer), issuer.certificate, older, nowhere)).toBe('issuer');
  });
});

describe('a certificate of the responder\'s name put in front of the real one', () => {
  it('cannot turn a genuine answer into a broken one', async () => {
    const decoy = await makeSigner('Issuing CA');
    const der = await makeOcsp(signer, issuer, { issuer, decoys: [decoy.certificate] });
    const answer = (await revocationOf(signer.certificate, [issuer.certificate], { ocsp: [der], crl: [] }))!;
    expect(answer.standing).toBe('holds');
    expect(await proveAnswer(answer, issuer.certificate, null, nowhere)).toBe('issuer');
  });
});
