import * as asn1js from 'asn1js';
import { Attribute, ContentInfo, EncapsulatedContentInfo, OtherRevocationInfoFormat, SignedAndUnsignedAttributes, SignedData } from 'pkijs';
import { beforeAll, describe, expect, it } from 'vitest';

import { C14N_10, C14N_11, C14N_EXCLUSIVE } from './c14n';
import { checkContainer, checkUnpacked } from './container';
import { revocationOf } from './revocation';
import {
  addCounterSignature,
  ASIC_E,
  ASIC_S,
  certificateFor,
  certificateIssuedBy,
  counterSignatureXml,
  container,
  damaged,
  makeCades,
  makeCrl,
  makeLargeCrl,
  makeManifest,
  makeOcsp,
  makeSigner,
  makeTimestampToken,
  makeXades,
  parseXml,
  revocationValuesXml,
  signatureElementOf,
  signatureTimestampXml,
  unsignedXml,
  utf8,
  type Signer,
} from './fixtures.test-helper';
import { archiveInput } from './xades';
import { childNamed, descendantsNamed, DS } from './xml';
import { ContainerRefused } from './zip';

const SIGNATURES = 'META-INF/signatures0.xml';
const NAME = 'smlouva č. 1.pdf';
const CONTENT = utf8('the contract');
const FILES = { [NAME]: CONTENT };

let signer: Signer;
let authority: Signer;

beforeAll(async () => {
  [signer, authority] = await Promise.all([makeSigner(), makeSigner('Test Authority')]);
});

const check = (zip: Uint8Array) => checkContainer(zip, parseXml);

/** A well-formed one-signature container, with the XML edited after signing if asked. */
async function signedContainer(edit: (xml: string) => string = (xml) => xml, files = FILES) {
  return check(container({ ...files, [SIGNATURES]: edit(await makeXades(files, signer)) }));
}

describe('an XAdES signature that holds', () => {
  it('is intact, covers the file and names the signer', async () => {
    const { signatures, files } = await signedContainer();

    expect(signatures).toHaveLength(1);
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].form).toBe('XAdES');
    expect(signatures[0].covers).toEqual([NAME]);
    expect(signatures[0].signedBy).toBe('Řehoř Čížek');
    expect(signatures[0].time?.toISOString()).toBe('2026-11-05T10:00:00.000Z');
    expect(files[0].coveredBy).toEqual([0]);
  });

  it.each([
    ['inclusive 1.0', C14N_10],
    ['inclusive 1.1', C14N_11],
    ['exclusive', C14N_EXCLUSIVE],
  ])('works under %s canonicalization', async (_label, canonicalization) => {
    const xml = await makeXades(FILES, signer, { canonicalization });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('intact');
  });

  it('works with an elliptic-curve key', async () => {
    const xml = await makeXades(FILES, await makeSigner('EC Signer', 'EC'));
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].signedBy).toBe('EC Signer');
  });

  it('reads files named through a signed ds:Manifest', async () => {
    const xml = await makeXades(FILES, signer, { viaManifest: true });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].covers).toEqual([NAME]);
  });

  it('finds a signature file in a subfolder of META-INF, as .adoc keeps them', async () => {
    const xml = await makeXades(FILES, signer);
    const { signatures } = await check(container({ ...FILES, 'META-INF/signatures/signatures0.xml': xml }, 'application/vnd.lt.archyvai.adoc-2008'));
    expect(signatures[0].verdict).toBe('intact');
  });

  it('does not need a mimetype entry, which the standard makes optional', async () => {
    const xml = await makeXades(FILES, signer);
    const result = await check(container({ ...FILES, [SIGNATURES]: xml }, null));
    expect(result.mediaType).toBeNull();
    expect(result.unusualMediaType).toBe(false);
    expect(result.signatures[0].verdict).toBe('intact');
  });

  it('notes a mimetype that names something else, without refusing', async () => {
    const xml = await makeXades(FILES, signer);
    const result = await check(container({ ...FILES, [SIGNATURES]: xml }, 'text/plain'));
    expect(result.unusualMediaType).toBe(true);
    expect(result.signatures[0].verdict).toBe('intact');
  });
});

describe('what a changed container reports', () => {
  it('names a file whose bytes changed', async () => {
    const xml = await makeXades(FILES, signer);
    const { signatures, files } = await check(container({ [NAME]: utf8('the contract, improved'), [SIGNATURES]: xml }));

    expect(signatures[0].verdict).toBe('altered');
    expect(signatures[0].changed).toEqual([NAME]);
    expect(signatures[0].covers).toEqual([]);
    expect(files[0].coveredBy).toEqual([]);
  });

  it('names a file that is gone', async () => {
    const xml = await makeXades(FILES, signer);
    const { signatures } = await check(container({ 'renamed.pdf': CONTENT, [SIGNATURES]: xml }));

    expect(signatures[0].verdict).toBe('altered');
    expect(signatures[0].missing).toEqual([NAME]);
  });

  it('reports a file nothing signs, and keeps the signature standing', async () => {
    const xml = await makeXades(FILES, signer);
    const { signatures, files } = await check(container({ ...FILES, 'payload.exe': utf8('x'), [SIGNATURES]: xml }));

    expect(signatures[0].verdict).toBe('intact');
    expect(files.find((file) => file.name === 'payload.exe')?.coveredBy).toEqual([]);
  });

  it('says only the changed file is uncovered when two signers cover different files', async () => {
    const files = { 'a.txt': utf8('a'), 'b.txt': utf8('b') };
    const second = await makeSigner('Second Signer');
    const { signatures, files: listed } = await check(
      container({
        ...files,
        'META-INF/signatures0.xml': await makeXades(files, signer),
        'META-INF/signatures1.xml': await makeXades({ 'a.txt': files['a.txt'] }, second),
      }),
    );

    expect(signatures.map((s) => s.signedBy)).toEqual(['Řehoř Čížek', 'Second Signer']);
    expect(listed.find((f) => f.name === 'a.txt')?.coveredBy).toEqual([0, 1]);
    expect(listed.find((f) => f.name === 'b.txt')?.coveredBy).toEqual([0]);
  });

  it('notices a file under a signed ds:Manifest changing', async () => {
    const xml = await makeXades(FILES, signer, { viaManifest: true });
    const { signatures } = await check(container({ [NAME]: utf8('changed'), [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('altered');
    expect(signatures[0].changed).toEqual([NAME]);
  });

  it('tells an edited signed detail apart from a changed file, and stops naming anyone', async () => {
    const { signatures } = await signedContainer((xml) => xml.replace('2026-11-05T10', '2031-11-05T10'));

    expect(signatures[0].verdict).toBe('altered');
    expect(signatures[0].detailsChanged).toBe(true);
    expect(signatures[0].changed).toEqual([]);
    // Neither the edited time nor the binding inside the edited element is evidence.
    expect(signatures[0].time).toBeNull();
    expect(signatures[0].signedBy).toBeNull();
  });
});

describe('a signature that does not hold', () => {
  it('says nothing about the files, because its digests are not evidence', async () => {
    const { signatures } = await signedContainer((xml) =>
      xml.replace(/(<ds:SignatureValue[^>]*>)(.)/, (_match, open, first) => `${open}${first === 'A' ? 'B' : 'A'}`),
    );

    expect(signatures[0].verdict).toBe('broken');
    expect(signatures[0].changed).toEqual([]);
    expect(signatures[0].covers).toEqual([]);
    expect(signatures[0].signedBy).toBeNull();
  });

  it('is broken when a digest in SignedInfo is edited to fit a changed file', async () => {
    const changed = utf8('the contract, improved');
    const honest = await makeXades({ [NAME]: changed }, signer);
    const digest = /<ds:Reference URI="[^#][^"]*">.*?<ds:DigestValue>([^<]+)/.exec(honest)![1];
    const xml = (await makeXades(FILES, signer)).replace(/(<ds:Reference URI="[^#][^"]*">.*?<ds:DigestValue>)[^<]+/, `$1${digest}`);

    const { signatures } = await check(container({ [NAME]: changed, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('broken');
  });

  it('does not attribute a signature to a certificate its signed details do not name', async () => {
    // The same key under a second name: the signature value still verifies against
    // it, so only the digest in the signed properties tells them apart.
    const impostor = await certificateFor('Somebody Else', signer, 'RSA', 2);
    const xml = await makeXades(FILES, signer, { keyInfoCertificate: impostor });

    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('broken');
    expect(signatures[0].signedBy).toBeNull();
  });

  it('picks the bound certificate out of several, rather than the first', async () => {
    const other = await makeSigner('Issuing CA');
    const body = await makeXades(FILES, signer);
    const encoded = btoa(String.fromCharCode(...other.der));
    const xml = body.replace('<ds:X509Data>', `<ds:X509Data><ds:X509Certificate>${encoded}</ds:X509Certificate>`);

    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].signedBy).toBe('Řehoř Čížek');
    expect(signatures[0].certificateCount).toBe(2);
  });
});

describe('wrapping: unsigned content made to look signed', () => {
  it('will not choose between two elements with the signed Id', async () => {
    const { signatures } = await signedContainer((xml) => {
      const properties = /<xades:SignedProperties[\s\S]*?<\/xades:SignedProperties>/.exec(xml)![0];
      const decoy = properties.replace('2026-11-05T10', '1999-01-01T10');
      return xml.replace('</ds:Signature>', `<ds:Object>${decoy}</ds:Object></ds:Signature>`);
    });

    expect(signatures[0].verdict).toBe('cannot-check');
  });

  it('ignores an unsigned time beside the signed one', async () => {
    const { signatures } = await signedContainer((xml) =>
      xml.replace('</ds:Signature>', '<ds:Object><xades:SigningTime>1999-01-01T00:00:00Z</xades:SigningTime></ds:Object></ds:Signature>'),
    );

    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].time?.toISOString()).toBe('2026-11-05T10:00:00.000Z');
  });
});

describe('what it declines to call intact', () => {
  it('a valid signature that signs none of the files', async () => {
    const xml = await makeXades(FILES, signer, { references: [] });
    const { signatures, files } = await check(container({ ...FILES, [SIGNATURES]: xml }));

    expect(signatures[0].verdict).toBe('covers-nothing');
    expect(signatures[0].signedBy).toBe('Řehoř Čížek');
    expect(files[0].coveredBy).toEqual([]);
  });

  it('a signature that only signs something under META-INF', async () => {
    const manifest = utf8('<manifest/>');
    const xml = await makeXades(FILES, signer, { references: [{ uri: 'META-INF/manifest.xml', bytes: manifest }] });
    const { signatures } = await check(container({ ...FILES, 'META-INF/manifest.xml': manifest, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('covers-nothing');
  });

  it('a reference with an empty URI', async () => {
    const xml = await makeXades(FILES, signer, { references: [{ uri: '', bytes: CONTENT }] });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('cannot-check');
  });

  it('a reference to something outside the container', async () => {
    const xml = await makeXades(FILES, signer, { references: [{ uri: 'https://example.org/x', bytes: CONTENT }] });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('cannot-check');
  });

  it('a digest a browser cannot compute', async () => {
    const xml = await makeXades(FILES, signer, {
      references: [{ uri: encodeURIComponent(NAME), bytes: CONTENT, digestUri: 'http://www.w3.org/2001/04/xmldsig-more#sha224' }],
    });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('cannot-check');
    expect(signatures[0].detail).toMatch(/sha224/);
  });

  it('a signature method it does not have', async () => {
    const { signatures } = await signedContainer((xml) => xml.replace(/SignatureMethod Algorithm="[^"]+"/, 'SignatureMethod Algorithm="urn:made-up"'));
    expect(signatures[0].verdict).toBe('cannot-check');
  });

  it('a signature carrying no certificate', async () => {
    const { signatures } = await signedContainer((xml) => xml.replace(/<ds:X509Certificate>[^<]+<\/ds:X509Certificate>/, ''));
    expect(signatures[0].verdict).toBe('cannot-check');
    expect(signatures[0].signedBy).toBeNull();
  });

  it('a signature with an empty certificate element and a real one survives the empty one', async () => {
    const { signatures } = await signedContainer((xml) => xml.replace('<ds:X509Data>', '<ds:X509Data><ds:X509Certificate></ds:X509Certificate>'));
    expect(signatures[0].verdict).toBe('intact');
  });

  it('a signature file with a DOCTYPE', async () => {
    const { signatures } = await signedContainer((xml) => xml.replace('<asic:XAdESSignatures', '<!DOCTYPE x [<!ENTITY a "b">]><asic:XAdESSignatures'));
    expect(signatures[0].verdict).toBe('unreadable');
  });

  it('a signature file that is not XML', async () => {
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: 'not xml at all' }));
    expect(signatures[0].verdict).toBe('unreadable');
  });

  it('a container of only unsigned files reports no signatures', async () => {
    const { signatures, files } = await check(container(FILES));
    expect(signatures).toEqual([]);
    expect(files[0].coveredBy).toEqual([]);
  });
});

describe('a timestamp on a signature', () => {
  const stamped = async (make: (value: Uint8Array) => Promise<Uint8Array>) => {
    const xml = await makeXades(FILES, signer, {
      unsigned: async (value) => signatureTimestampXml(await make(value)),
    });
    return (await check(container({ ...FILES, [SIGNATURES]: xml }))).signatures[0];
  };

  it('holds when it describes this signature and its own signature verifies', async () => {
    const signature = await stamped((value) => makeTimestampToken(value, authority));

    expect(signature.verdict).toBe('intact');
    expect(signature.timestamp?.standing).toBe('holds');
    expect(signature.timestamp?.time.toISOString()).toBe('2026-11-05T10:00:07.000Z');
    expect(signature.timestamp?.signedBy).toBe('Test Authority');
  });

  it('holds under a digest other than SHA-256', async () => {
    const signature = await stamped((value) => makeTimestampToken(value, authority, { hash: 'SHA-384' }));
    expect(signature.timestamp?.standing).toBe('holds');
  });

  it('is not corroboration when it describes something else', async () => {
    const signature = await stamped(() => makeTimestampToken(utf8('another signature'), authority));
    expect(signature.timestamp?.standing).toBe('other-signature');
  });

  it('is not corroboration when its own signature does not verify', async () => {
    const signature = await stamped(async (value) => damaged(await makeTimestampToken(value, authority)));
    expect(signature.timestamp?.standing).toBe('broken');
  });

  it('claims nothing about a digest it cannot compute', async () => {
    const signature = await stamped((value) => makeTimestampToken(value, authority, { hashOid: '1.2.3.4.5' }));
    expect(signature.timestamp?.standing).toBe('cannot-check');
  });

  it('accepts a token that names no method and used the signature\'s own', async () => {
    // Real writers do this. The value being stamped is the same either way.
    const xml = await makeXades(FILES, signer, {
      unsigned: async (value) => signatureTimestampXml(await makeTimestampToken(value, authority), null),
    });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].timestamp?.standing).toBe('holds');
  });

  it('holds a token that names a method to that method', async () => {
    const xml = await makeXades(FILES, signer, {
      unsigned: async (value) => signatureTimestampXml(await makeTimestampToken(value, authority), C14N_10),
    });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].timestamp?.standing).toBe('other-signature');
  });

  it('leaves the signature itself standing whatever the token says', async () => {
    const signature = await stamped(() => makeTimestampToken(utf8('another signature'), authority));
    expect(signature.verdict).toBe('intact');
  });
});

describe('archive manifests that say nothing', () => {
  it('a list it cannot read as an archive manifest is reported, not skipped', async () => {
    const xml = await makeXades(FILES, signer);
    const result = await check(container({ ...FILES, [SIGNATURES]: xml, 'META-INF/ASiCArchiveManifest.xml': '<x/>' }));
    expect(result.archives).toHaveLength(1);
    expect(result.archives[0].standing).toBe('unreadable');
  });
});

describe('a CAdES signature over an ASiCManifest', () => {
  const P7S = 'META-INF/signature001.p7s';
  const MANIFEST = 'META-INF/ASiCManifest.xml';

  const parts = async (signing = signer, bundle: Signer[] = []) => {
    const manifest = await makeManifest(P7S, FILES);
    return { [MANIFEST]: manifest, [P7S]: await makeCades(manifest, signing, bundle) };
  };

  it('is intact and covers the files the manifest lists', async () => {
    const { signatures, files } = await check(container({ ...FILES, ...(await parts()) }));

    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].form).toBe('CAdES');
    expect(signatures[0].covers).toEqual([NAME]);
    expect(signatures[0].time?.toISOString()).toBe('2026-11-05T10:00:00.000Z');
    expect(files[0].coveredBy).toEqual([0]);
  });

  it('names the certificate the SignerInfo identifies, not the first in the bundle', async () => {
    const { signatures } = await check(container({ ...FILES, ...(await parts(signer, [authority])) }));
    expect(signatures[0].signedBy).toBe('Řehoř Čížek');
    expect(signatures[0].certificateCount).toBe(2);
  });

  it('reports a listed file that changed', async () => {
    const { signatures } = await check(container({ [NAME]: utf8('changed'), ...(await parts()) }));
    expect(signatures[0].verdict).toBe('altered');
    expect(signatures[0].changed).toEqual([NAME]);
  });

  it('reports a listed file that is gone', async () => {
    const { signatures } = await check(container({ ...(await parts()) }));
    expect(signatures[0].verdict).toBe('altered');
    expect(signatures[0].missing).toEqual([NAME]);
  });

  it('reports a manifest edited after signing as changed details, not a changed file', async () => {
    const built = await parts();
    const edited = utf8(new TextDecoder().decode(built[MANIFEST]).replace('<asic:SigReference', '<!-- x --><asic:SigReference'));
    const { signatures } = await check(container({ ...FILES, ...built, [MANIFEST]: edited }));
    expect(signatures[0].verdict).toBe('altered');
    expect(signatures[0].detailsChanged).toBe(true);
  });

  it('is broken when the signature value is damaged, and claims nothing about the files', async () => {
    const built = await parts();
    const { signatures } = await check(container({ [NAME]: utf8('changed'), ...built, [P7S]: damaged(built[P7S]) }));
    expect(signatures[0].verdict).toBe('broken');
    expect(signatures[0].changed).toEqual([]);
    expect(signatures[0].signedBy).toBeNull();
    expect(signatures[0].time).toBeNull();
  });

  it('names nobody when the signature is over a different list', async () => {
    const built = await parts();
    const edited = utf8(new TextDecoder().decode(built[MANIFEST]).replace('<asic:SigReference', '<!-- x --><asic:SigReference'));
    const { signatures } = await check(container({ ...FILES, ...built, [MANIFEST]: edited }));
    expect(signatures[0].signedBy).toBeNull();
    expect(signatures[0].time).toBeNull();
  });

  it('is unreadable when the manifest points to nothing', async () => {
    const manifest = await makeManifest('META-INF/signature999.p7s', FILES);
    const { signatures } = await check(container({ ...FILES, [MANIFEST]: manifest }));
    expect(signatures[0].verdict).toBe('unreadable');
  });

  it('says so when a manifest lists nothing in the container', async () => {
    const manifest = await makeManifest(P7S, {});
    const { signatures } = await check(container({ ...FILES, [MANIFEST]: manifest, [P7S]: await makeCades(manifest, signer) }));
    expect(signatures[0].verdict).toBe('covers-nothing');
  });
});

describe('a time assertion over an ASiCManifest', () => {
  const TST = 'META-INF/timestamp001.tst';
  const MANIFEST = 'META-INF/ASiCManifest.xml';

  it('is intact, and is a timestamp rather than a signature', async () => {
    const manifest = await makeManifest(TST, FILES);
    const { signatures } = await check(container({ ...FILES, [MANIFEST]: manifest, [TST]: await makeTimestampToken(manifest, authority) }));

    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].form).toBe('timestamp');
    expect(signatures[0].time?.toISOString()).toBe('2026-11-05T10:00:07.000Z');
    expect(signatures[0].signedBy).toBe('Test Authority');
  });

  it('reports the list as changed when the token describes another', async () => {
    const manifest = await makeManifest(TST, FILES);
    const { signatures } = await check(container({ ...FILES, [MANIFEST]: manifest, [TST]: await makeTimestampToken(utf8('another'), authority) }));
    expect(signatures[0].verdict).toBe('altered');
    expect(signatures[0].detailsChanged).toBe(true);
  });

  it('is broken when the token does not verify', async () => {
    const manifest = await makeManifest(TST, FILES);
    const { signatures } = await check(container({ ...FILES, [MANIFEST]: manifest, [TST]: damaged(await makeTimestampToken(manifest, authority)) }));
    expect(signatures[0].verdict).toBe('broken');
  });
});

describe('what it is decided from the content', () => {
  const refuses = async (zip: Uint8Array, pattern: RegExp) => {
    await expect(check(zip)).rejects.toThrow(ContainerRefused);
    await expect(check(zip)).rejects.toThrow(pattern);
  };

  it('says of an ordinary ZIP only that it found nothing it can read', async () => {
    await refuses(container({ 'a.txt': 'x' }, null), /No signature this check can read/);
  });

  it('turns away an office document, which can look much like a container', async () => {
    await refuses(
      container({ 'content.xml': '<x/>', 'META-INF/documentsignatures.xml': '<x/>' }, 'application/vnd.oasis.opendocument.text'),
      /office document/,
    );
  });

  it('reads a container whose mimetype says so, even with nothing signed in it', async () => {
    const result = await check(container({ 'a.txt': 'x' }, ASIC_E));
    expect(result.signatures).toEqual([]);
  });
});

describe('a counter-signature nested in an XAdES signature', () => {
  /** A parent signature carrying one counter-signature from `by`. */
  const counterSigned = (by: Signer, extra?: (value: Uint8Array) => Promise<string>) =>
    makeXades(FILES, signer, {
      unsigned: async (value) => {
        const nested = await makeXades(FILES, by, { references: [], id: 'C1', counterSigning: { parentId: 'S0', value } });
        return unsignedXml(counterSignatureXml(signatureElementOf(nested, 'C1')) + (extra ? await extra(value) : ''));
      },
    });

  it('is listed after its parent, names its own signer, and holds', async () => {
    const xml = await counterSigned(authority);
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));

    expect(signatures).toHaveLength(2);
    expect(signatures[0].counters).toBeNull();
    expect(signatures[1].counters).toBe(0);
    expect(signatures[1].verdict).toBe('intact');
    expect(signatures[1].signedBy).toBe('Test Authority');
  });

  it('does not make the parent fail, or its files', async () => {
    const xml = await counterSigned(authority);
    const { signatures, files } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('intact');
    expect(files[0].coveredBy).toEqual([0]);
  });

  it('notices the signature it counter-signs having changed', async () => {
    // Edit the parent's value inside the bytes the counter-signature covers. The parent
    // also breaks, but each reports its own finding.
    const xml = (await counterSigned(authority)).replace(/(<ds:SignatureValue Id="S0-SV">)(.)/, (_m, open, first) => `${open}${first === 'A' ? 'B' : 'A'}`);
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));

    expect(signatures[0].verdict).toBe('broken');
    expect(signatures[1].verdict).toBe('altered');
    expect(signatures[1].counterChanged).toBe(true);
  });

  it('will not count a signature that is nested and signs something else', async () => {
    const xml = await makeXades(FILES, signer, {
      unsigned: async () => {
        const nested = await makeXades(FILES, authority, { id: 'C1' });
        return unsignedXml(counterSignatureXml(signatureElementOf(nested, 'C1')));
      },
    });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[1].verdict).toBe('cannot-check');
    expect(signatures[1].detail).toMatch(/does not sign/);
  });

  it('will not resolve its reference to anything but its parent\'s value', async () => {
    const xml = await makeXades(FILES, signer, {
      unsigned: async (value) => {
        const nested = await makeXades(FILES, authority, { references: [], id: 'C1', counterSigning: { parentId: 'nobody', value } });
        return unsignedXml(counterSignatureXml(signatureElementOf(nested, 'C1')));
      },
    });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[1].verdict).toBe('cannot-check');
  });

  it('keeps a counter-signature\'s timestamp and revocation answer off its parent', async () => {
    const xml = await makeXades(FILES, signer, {
      unsigned: async (value) => {
        const nested = await makeXades(FILES, authority, {
          references: [],
          id: 'C1',
          counterSigning: { parentId: 'S0', value },
          unsigned: async (own) =>
            unsignedXml(
              revocationValuesXml([await makeOcsp(signer, authority)]) +
                `<xades:SignatureTimeStamp><xades:EncapsulatedTimeStamp>${btoa(String.fromCharCode(...(await makeTimestampToken(own, authority))))}</xades:EncapsulatedTimeStamp></xades:SignatureTimeStamp>`,
            ),
        });
        return unsignedXml(counterSignatureXml(signatureElementOf(nested, 'C1')));
      },
    });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].timestamp).toBeNull();
    expect(signatures[0].revocation).toBeNull();
  });

  it('reports one route it does not follow rather than passing it', async () => {
    const xml = await makeXades(FILES, signer, {
      references: [{ uri: encodeURIComponent(NAME), bytes: CONTENT }, { uri: 'META-INF/other.xml', bytes: CONTENT, type: 'http://uri.etsi.org/01903#CountersignedSignature' }],
    });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('cannot-check');
  });
});

describe('a counter-signature inside a CMS', () => {
  const P7S = 'META-INF/signature.p7s';

  it('holds, names its own signer, and points at its parent', async () => {
    const p7s = await addCounterSignature(await makeCades(CONTENT, signer), authority);
    const { signatures } = await check(container({ ...FILES, [P7S]: p7s }, ASIC_S));

    expect(signatures).toHaveLength(2);
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[1].counters).toBe(0);
    expect(signatures[1].verdict).toBe('intact');
    expect(signatures[1].signedBy).toBe('Test Authority');
    expect(signatures[1].time?.toISOString()).toBe('2026-11-05T10:01:00.000Z');
  });

  it('breaks when its signature value is damaged, and names nobody', async () => {
    const p7s = await addCounterSignature(await makeCades(CONTENT, signer), authority);
    const signed = new SignedData({ schema: ContentInfo.fromBER(p7s.slice().buffer as ArrayBuffer).content });
    const counter = signed.signerInfos[0].unsignedAttrs!.attributes[0].values[0] as { valueBlock: { value: Array<{ valueBlock: { valueHexView: Uint8Array } }> } };
    const value = counter.valueBlock.value.at(-1)!.valueBlock.valueHexView;
    value[value.length - 1] ^= 0xff;
    const damagedCounter = new Uint8Array(new ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: signed.toSchema(true) }).toSchema().toBER(false));

    const { signatures } = await check(container({ ...FILES, [P7S]: damagedCounter }, ASIC_S));
    expect(signatures[1].verdict).toBe('broken');
    expect(signatures[1].signedBy).toBeNull();
  });
});

describe('a revocation answer the signature carries', () => {
  const answered = async (ocsp: Uint8Array[], crl: Uint8Array[] = [], signing = signer) => {
    const xml = await makeXades(FILES, signing, { unsigned: () => unsignedXml(revocationValuesXml(ocsp, crl)) });
    return (await check(container({ ...FILES, [SIGNATURES]: xml }))).signatures[0];
  };

  it('reports a good answer, who gave it and when', async () => {
    const { revocation } = await answered([await makeOcsp(signer, authority)]);
    expect(revocation).toMatchObject({ kind: 'OCSP', status: 'good', standing: 'holds', from: 'Test Authority' });
    expect(revocation?.at?.toISOString()).toBe('2026-11-05T10:00:09.000Z');
  });

  it('reports a revoked answer with its time, and leaves the signature\'s own verdict alone', async () => {
    const signature = await answered([await makeOcsp(signer, authority, { status: 'revoked' })]);
    expect(signature.revocation).toMatchObject({ status: 'revoked', standing: 'holds' });
    expect(signature.revocation?.revokedAt?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(signature.verdict).toBe('intact');
  });

  it('reports an answer that does not know the certificate', async () => {
    const { revocation } = await answered([await makeOcsp(signer, authority, { status: 'unknown' })]);
    expect(revocation?.status).toBe('unknown');
  });

  it('ignores an answer about another certificate, such as the timestamp authority\'s', async () => {
    const other = await certificateFor('Someone Else', authority, 'RSA', 7);
    const { revocation } = await answered([await makeOcsp(other, authority)]);
    expect(revocation).toBeNull();
  });

  it('does not let a good answer about the wrong issuer stand for this certificate', async () => {
    // Same serial, but the CertID names a different issuer.
    const lookalike = await certificateFor('A Different Issuer', authority, 'RSA', 1);
    const { revocation } = await answered([await makeOcsp(lookalike, authority)]);
    expect(revocation).toBeNull();
  });

  it('is exposed when it does not verify', async () => {
    // Without the responder's certificate trailing it, the last bytes are the signature.
    const forged = damaged(await makeOcsp(signer, authority, { carryResponder: false }));
    const xml = await makeXades(FILES, signer, { unsigned: () => unsignedXml(revocationValuesXml([forged])) });
    const carrying = xml.replace('<ds:X509Data>', `<ds:X509Data><ds:X509Certificate>${btoa(String.fromCharCode(...authority.der))}</ds:X509Certificate>`);
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: carrying }));
    expect(signatures[0].revocation?.standing).toBe('broken');
  });

  it('claims nothing when the certificate that made it is not here', async () => {
    const { revocation } = await answered([await makeOcsp(signer, authority, { carryResponder: false })]);
    expect(revocation?.standing).toBe('cannot-check');
  });

  it('reads a CRL that lists the certificate as revoked', async () => {
    const { revocation } = await answered([], [await makeCrl(signer, [signer])]);
    expect(revocation).toMatchObject({ kind: 'CRL', status: 'revoked', standing: 'holds' });
  });

  it('reads a CRL that does not', async () => {
    const { revocation } = await answered([], [await makeCrl(signer)]);
    expect(revocation).toMatchObject({ kind: 'CRL', status: 'good', standing: 'holds' });
  });

  it('ignores a CRL from another issuer', async () => {
    const { revocation } = await answered([], [await makeCrl(authority, [signer])]);
    expect(revocation).toBeNull();
  });

  it('of several, reports the worst', async () => {
    const { revocation } = await answered([await makeOcsp(signer, authority), await makeOcsp(signer, authority, { status: 'revoked' })]);
    expect(revocation?.status).toBe('revoked');
  });

  it('is not given for a signature that does not hold', async () => {
    const xml = await makeXades(FILES, signer, { unsigned: async () => unsignedXml(revocationValuesXml([await makeOcsp(signer, authority)])) });
    const edited = xml.replace(/<ds:SignatureValue Id="S0-SV">(.)/, (_m, first) => `<ds:SignatureValue Id="S0-SV">${first === 'A' ? 'B' : 'A'}`);
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: edited }));
    expect(signatures[0].revocation).toBeNull();
  });
});

describe('an archive timestamp inside an XAdES signature', () => {
  const stamped = async (make: (input: Uint8Array) => Promise<Uint8Array>) => {
    // Built in two passes: what it covers depends on the signature it will sit in.
    const element = (token: Uint8Array) =>
      `<xades141:ArchiveTimeStamp xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#"><ds:CanonicalizationMethod Algorithm="${C14N_EXCLUSIVE}"/><xades:EncapsulatedTimeStamp>${btoa(String.fromCharCode(...token))}</xades:EncapsulatedTimeStamp></xades141:ArchiveTimeStamp>`;
    const first = await makeXades(FILES, signer, { unsigned: () => unsignedXml(element(utf8('x'))) });
    const document = parseXml(first);
    const signature = document.getElementsByTagNameNS(DS, 'Signature')[0] as unknown as Element;
    const qualifying = descendantsNamed(signature, 'QualifyingProperties')[0];
    const stamp = descendantsNamed(signature, 'ArchiveTimeStamp')[0];
    const input = archiveInput(stamp, 0, [stamp], signature, childNamed(signature, 'SignedInfo', DS)!, qualifying, new Map(Object.entries(FILES)))!;
    const token = await make(input);
    const xml = await makeXades(FILES, signer, { unsigned: () => unsignedXml(element(token)) });
    return (await check(container({ ...FILES, [SIGNATURES]: xml }))).signatures[0];
  };

  it('holds when the token describes what it covers', async () => {
    const signature = await stamped((input) => makeTimestampToken(input, authority));
    expect(signature.archiveTimestamps.map((stamp) => stamp.standing)).toEqual(['holds']);
    expect(signature.archiveTimestamps[0].signedBy).toBe('Test Authority');
  });

  it('stays unconfirmed, not damning, when it does not match', async () => {
    const signature = await stamped(() => makeTimestampToken(utf8('something else'), authority));
    expect(signature.archiveTimestamps[0].standing).toBe('other-signature');
    expect(signature.verdict).toBe('intact');
  });

  it('is exposed when its own signature does not verify', async () => {
    const signature = await stamped(async (input) => damaged(await makeTimestampToken(input, authority)));
    expect(signature.archiveTimestamps[0].standing).toBe('broken');
  });
});

describe('an ASiCArchiveManifest', () => {
  const P7S = 'META-INF/signature001.p7s';
  const MANIFEST = 'META-INF/ASiCManifest.xml';
  const ARCHIVE = 'META-INF/ASiCArchiveManifest.xml';
  const TST = 'META-INF/timestamp001.tst';

  const build = async (over: { listing?: Record<string, Uint8Array>; token?: (manifest: Uint8Array) => Promise<Uint8Array>; replace?: Record<string, Uint8Array> } = {}) => {
    const manifest = await makeManifest(P7S, FILES);
    const p7s = await makeCades(manifest, signer);
    const parts = { ...FILES, [MANIFEST]: manifest, [P7S]: p7s };
    const archive = await makeManifest(TST, over.listing ?? parts);
    const token = await (over.token ?? ((bytes) => makeTimestampToken(bytes, authority)))(archive);
    return (await check(container({ ...parts, [ARCHIVE]: archive, [TST]: token, ...over.replace }))).archives[0];
  };

  it('holds, and covers every signature', async () => {
    const archive = await build();
    expect(archive).toMatchObject({ standing: 'holds', coversEverySignature: true, signedBy: 'Test Authority', changed: [], missing: [] });
  });

  it('reads a token whose content is a constructed string, as real ones can be', async () => {
    const archive = await build({ token: (bytes) => makeTimestampToken(bytes, authority, { constructed: true }) });
    expect(archive.standing).toBe('holds');
  });

  it('names a part that changed afterwards', async () => {
    const archive = await build({ replace: { [NAME]: utf8('changed') } });
    expect(archive.changed).toEqual([NAME]);
  });

  it('says so when it does not cover a signature', async () => {
    const archive = await build({ listing: FILES });
    expect(archive.coversEverySignature).toBe(false);
  });

  it('says so when the token is over another list', async () => {
    const archive = await build({ token: () => makeTimestampToken(utf8('another list'), authority) });
    expect(archive.standing).toBe('other-signature');
  });

  it('says so when the token does not verify', async () => {
    const archive = await build({ token: async (bytes) => damaged(await makeTimestampToken(bytes, authority)) });
    expect(archive.standing).toBe('broken');
  });

  it('does not raise an alarm over an older one a newer one has renewed', async () => {
    const OLDER = 'META-INF/ASiCArchiveManifest1.xml';
    const OLDER_TST = 'META-INF/timestamp000.tst';
    const manifest = await makeManifest(P7S, FILES);
    const p7s = await makeCades(manifest, signer);
    const parts = { ...FILES, [MANIFEST]: manifest, [P7S]: p7s };

    // The older one listed the signature file as it was before evidence was added.
    const older = await makeManifest(OLDER_TST, { ...parts, [P7S]: utf8('the signature file, before renewal') });
    const olderToken = await makeTimestampToken(older, authority, { at: new Date(Date.UTC(2025, 0, 1)) });
    const newer = await makeManifest(TST, { ...parts, [OLDER]: older, [OLDER_TST]: olderToken });

    const { archives } = await check(
      container({ ...parts, [OLDER]: older, [OLDER_TST]: olderToken, [ARCHIVE]: newer, [TST]: await makeTimestampToken(newer, authority) }),
    );
    const previous = archives.find((archive) => archive.source === OLDER)!;
    expect(previous.changed).toEqual([P7S]);
    expect(previous.renewedBy).toBe(ARCHIVE);
    expect(archives.find((archive) => archive.source === ARCHIVE)?.renewedBy).toBeNull();
  });

  it('keeps the alarm when nothing later accounts for the change', async () => {
    const archive = await build({ replace: { [NAME]: utf8('changed') } });
    expect(archive.renewedBy).toBeNull();
  });

  it('does not treat the archive token as a signature of its own', async () => {
    const manifest = await makeManifest(P7S, FILES);
    const p7s = await makeCades(manifest, signer);
    const parts = { ...FILES, [MANIFEST]: manifest, [P7S]: p7s };
    const archive = await makeManifest(TST, parts);
    const { signatures } = await check(container({ ...parts, [ARCHIVE]: archive, [TST]: await makeTimestampToken(archive, authority) }));
    expect(signatures).toHaveLength(1);
  });
});

describe('the single-file kind of container, ASiC-S', () => {
  const P7S = 'META-INF/signature.p7s';
  const TST = 'META-INF/timestamp.tst';

  it('checks a CMS signature directly over the file', async () => {
    const { signatures, files } = await check(container({ ...FILES, [P7S]: await makeCades(CONTENT, signer) }, ASIC_S));
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].covers).toEqual([NAME]);
    expect(signatures[0].signedBy).toBe('Řehoř Čížek');
    expect(files[0].coveredBy).toEqual([0]);
  });

  it('names the file when it changed', async () => {
    const { signatures } = await check(container({ [NAME]: utf8('changed'), [P7S]: await makeCades(CONTENT, signer) }, ASIC_S));
    expect(signatures[0].verdict).toBe('altered');
    expect(signatures[0].changed).toEqual([NAME]);
    expect(signatures[0].signedBy).toBeNull();
  });

  it('checks a timestamp directly over the file', async () => {
    const { signatures } = await check(container({ ...FILES, [TST]: await makeTimestampToken(CONTENT, authority) }, ASIC_S));
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].form).toBe('timestamp');
    expect(signatures[0].covers).toEqual([NAME]);
  });

  it('checks an XAdES signature, which names its file', async () => {
    const xml = await makeXades(FILES, signer);
    const { signatures } = await check(container({ ...FILES, 'META-INF/signatures.xml': xml }, ASIC_S));
    expect(signatures[0].verdict).toBe('intact');
  });

  it('will not guess which of several files a CMS signature is over', async () => {
    const { signatures } = await check(container({ ...FILES, 'other.txt': utf8('x'), [P7S]: await makeCades(CONTENT, signer) }, ASIC_S));
    expect(signatures[0].verdict).toBe('cannot-check');
    expect(signatures[0].detail).toMatch(/which of the 2/);
  });

  it('does not look for that file in a subfolder, and claims nothing about what it never verified', async () => {
    const { signatures } = await check(container({ 'folder/a.txt': CONTENT, [P7S]: await makeCades(CONTENT, signer) }, ASIC_S));
    expect(signatures[0].verdict).toBe('cannot-check');
  });

  it('reads the shape without a mimetype too', async () => {
    const { signatures } = await check(container({ ...FILES, [P7S]: await makeCades(CONTENT, signer) }, null));
    expect(signatures[0].verdict).toBe('intact');
  });
});

describe('a CMS file in ASiC-E that no list claims', () => {
  it('is reported, not passed over', async () => {
    const { signatures } = await check(container({ ...FILES, 'META-INF/signature9.p7s': await makeCades(CONTENT, signer) }, ASIC_E));
    expect(signatures[0].verdict).toBe('cannot-check');
    expect(signatures[0].detail).toMatch(/nothing says what it signs/);
  });
});

describe('what a CMS signature carries beside it', () => {
  const P7S = 'META-INF/signature.p7s';
  const carrying = (signed: SignedData) =>
    new Uint8Array(new ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: signed.toSchema(true) }).toSchema().toBER(false));
  const parsed = (der: Uint8Array) => new SignedData({ schema: ContentInfo.fromBER(der.slice().buffer as ArrayBuffer).content });

  it('reads an OCSP answer filed among its revocation choices', async () => {
    const signed = parsed(await makeCades(CONTENT, signer, [authority]));
    const ocsp = asn1js.fromBER((await makeOcsp(signer, authority)).slice().buffer as ArrayBuffer).result;
    signed.crls = [new OtherRevocationInfoFormat({ otherRevInfoFormat: '1.3.6.1.5.5.7.16.2', otherRevInfo: ocsp })];

    const { signatures } = await check(container({ ...FILES, [P7S]: carrying(signed) }, ASIC_S));
    expect(signatures[0].revocation).toMatchObject({ kind: 'OCSP', status: 'good', standing: 'holds' });
  });

  it('names an archive timestamp inside the CMS, which it does not read', async () => {
    const signed = parsed(await makeCades(CONTENT, signer));
    signed.signerInfos[0].unsignedAttrs = new SignedAndUnsignedAttributes({
      type: 1,
      attributes: [new Attribute({ type: '0.4.0.1733.2.4', values: [new asn1js.Null()] })],
    });

    const { signatures } = await check(container({ ...FILES, [P7S]: carrying(signed) }, ASIC_S));
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].unchecked).toEqual(['archive-timestamp']);
  });
});

describe('a revocation list too large for the parser\'s default limit', () => {
  it('is read, where a real authority\'s of over 2,500 entries used to vanish', async () => {
    const others = await Promise.all(Array.from({ length: 2600 }, (_v, i) => i)).then((ids) => ids.map((id) => id + 1000));
    const big = await makeLargeCrl(signer, others, signer);
    const xml = await makeXades(FILES, signer, { unsigned: () => unsignedXml(revocationValuesXml([], [big])) });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].revocation).toMatchObject({ kind: 'CRL', status: 'revoked', standing: 'holds' });
  });
});

describe('an answer that cannot be read', () => {
  it('is reported, because it may be about this signer', async () => {
    const xml = await makeXades(FILES, signer, { unsigned: () => unsignedXml(revocationValuesXml([], [utf8('not a revocation list')])) });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].revocation).toMatchObject({ standing: 'cannot-check', at: null });
  });

  it('applies to an OCSP answer too', async () => {
    const xml = await makeXades(FILES, signer, { unsigned: () => unsignedXml(revocationValuesXml([utf8('not an answer')])) });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].revocation).toMatchObject({ standing: 'cannot-check' });
  });

  it('never outranks a verified revocation', async () => {
    const xml = await makeXades(FILES, signer, {
      unsigned: async () => unsignedXml(revocationValuesXml([await makeOcsp(signer, authority, { status: 'revoked' }), utf8('nonsense')])),
    });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].revocation).toMatchObject({ status: 'revoked', standing: 'holds' });
  });
});

describe('a scoped revocation list', () => {
  it('means nothing by leaving a certificate out', async () => {
    const xml = await makeXades(FILES, signer, { unsigned: async () => unsignedXml(revocationValuesXml([], [await makeCrl(signer, [], { delta: true })])) });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].revocation).toMatchObject({ status: 'unknown', standing: 'cannot-check' });
  });
});

describe('one malformed signature among good ones', () => {
  const twoFiles = async () => ({ 'META-INF/signatures0.xml': await makeXades(FILES, signer) });

  it('does not lose the good one to a CMS with no signers', async () => {
    const certificatesOnly = new SignedData({
      version: 1,
      encapContentInfo: new EncapsulatedContentInfo({ eContentType: '1.2.840.113549.1.7.1' }),
      signerInfos: [],
      certificates: [signer.certificate],
    });
    const p7s = new Uint8Array(new ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: certificatesOnly.toSchema(true) }).toSchema().toBER(false));
    const { signatures } = await check(container({ ...FILES, ...(await twoFiles()), 'META-INF/signature9.p7s': p7s }, 'application/vnd.bdoc-1.0'));
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures).toHaveLength(2);
    expect(signatures[1].verdict).not.toBe('intact');
  });

  it('does not lose the good one to invalid base64 in another', async () => {
    const bad = (await makeXades(FILES, signer)).replace(/(<ds:SignatureValue[^>]*>)[^<]+/, '$1%%% not base64 %%%');
    const { signatures } = await check(container({ ...FILES, ...(await twoFiles()), 'META-INF/signatures1.xml': bad }));
    expect(signatures.map((signature) => signature.verdict)).toEqual(['intact', 'unreadable']);
  });

  it('reports a bad digest in a manifest as that one unreadable', async () => {
    const manifest = new TextDecoder().decode(await makeManifest('META-INF/signature001.p7s', FILES)).replace(/(<ds:DigestValue>)[^<]+/, '$1%%%');
    const { signatures } = await check(
      container({ ...FILES, ...(await twoFiles()), 'META-INF/ASiCManifest.xml': manifest, 'META-INF/signature001.p7s': await makeCades(utf8(manifest), signer) }),
    );
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[1].verdict).toBe('unreadable');
  });
});

describe('a CMS over another document', () => {
  it('does not cover the file beside it', async () => {
    const p7m = new SignedData({ schema: ContentInfo.fromBER((await makeCades(utf8('what Alice signed'), signer)).slice().buffer as ArrayBuffer).content });
    p7m.encapContentInfo.eContent = new asn1js.OctetString({ valueHex: utf8('what Alice signed').buffer as ArrayBuffer });
    const bytes = new Uint8Array(new ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: p7m.toSchema(true) }).toSchema().toBER(false));

    const { signatures, files } = await check(container({ 'report.pdf': utf8('something Alice never saw'), 'META-INF/signature.p7s': bytes }, ASIC_S));
    expect(signatures[0].verdict).toBe('altered');
    expect(signatures[0].covers).toEqual([]);
    expect(signatures[0].signedBy).toBeNull();
    expect(files[0].coveredBy).toEqual([]);
  });
});

describe('findings from review', () => {
  it('finds a file the manifest names in the other Unicode form', async () => {
    const nfc = 'smlouva-č.pdf'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    const P7S = 'META-INF/signature001.p7s';
    const manifest = await makeManifest(P7S, { [nfc]: CONTENT });
    const { signatures } = await check(container({ [nfd]: CONTENT, 'META-INF/ASiCManifest.xml': manifest, [P7S]: await makeCades(manifest, signer) }));
    expect(signatures[0].verdict).toBe('intact');
  });

  it('does not let an archive manifest hide a signature file by naming it', async () => {
    const p7s = await makeCades(CONTENT, signer);
    const archive = await makeManifest('META-INF/signature.p7s', FILES);
    const { signatures } = await check(container({ ...FILES, 'META-INF/signature.p7s': p7s, 'META-INF/ASiCArchiveManifest.xml': archive }, ASIC_S));
    expect(signatures).toHaveLength(1);
    expect(signatures[0].verdict).toBe('intact');
  });

  const renewalParts = async (older: Record<string, Uint8Array>) => {
    const P7S = 'META-INF/signature001.p7s';
    const manifest = await makeManifest(P7S, FILES);
    const parts = { ...FILES, 'META-INF/ASiCManifest.xml': manifest, [P7S]: await makeCades(manifest, signer) };
    const olderList = await makeManifest('META-INF/timestamp000.tst', { ...parts, ...older });
    const olderToken = await makeTimestampToken(olderList, authority, { at: new Date(Date.UTC(2025, 0, 1)) });
    const all = { ...parts, 'META-INF/ASiCArchiveManifest1.xml': olderList, 'META-INF/timestamp000.tst': olderToken };
    const newer = await makeManifest('META-INF/timestamp001.tst', all);
    return { ...all, 'META-INF/ASiCArchiveManifest.xml': newer, 'META-INF/timestamp001.tst': await makeTimestampToken(newer, authority) };
  };
  const older = 'META-INF/ASiCArchiveManifest1.xml';

  it('explains a changed signature file by a later renewal', async () => {
    const { archives } = await check(container(await renewalParts({ 'META-INF/signature001.p7s': utf8('before renewal') })));
    expect(archives.find((archive) => archive.source === older)?.renewedBy).toBe('META-INF/ASiCArchiveManifest.xml');
  });

  it('never explains a changed data file by a renewal', async () => {
    const { archives } = await check(container(await renewalParts({ [NAME]: utf8('the document as it was') })));
    expect(archives.find((archive) => archive.source === older)?.renewedBy).toBeNull();
  });
});

describe('findings from the third review', () => {
  it('uses the hash the signature algorithm names for a counter-signature', async () => {
    const p7s = await addCounterSignature(await makeCades(CONTENT, signer), authority, { signatureAlgorithm: 'SHA-384' });
    const { signatures } = await check(container({ ...FILES, 'META-INF/signature.p7s': p7s }, ASIC_S));
    expect(signatures[1].verdict).toBe('intact');
  });

  it('finds the right certificate when a re-keyed authority has two of one name', async () => {
    const old = await makeSigner('Same Authority');
    const current = await makeSigner('Same Authority');
    const crl = await makeCrl(current);
    const leaf = await certificateIssuedBy('Signer', signer, current);
    const answer = await revocationOf(leaf.certificate, [old.certificate, current.certificate], { ocsp: [], crl: [crl] });
    expect(answer).toMatchObject({ standing: 'holds', status: 'good' });

    const ocsp = await makeOcsp(leaf, authority, { issuer: current });
    const fromOcsp = await revocationOf(leaf.certificate, [old.certificate, current.certificate], { ocsp: [ocsp], crl: [] });
    expect(fromOcsp).toMatchObject({ kind: 'OCSP', standing: 'holds' });
  });

  it('is not confused by what a file manager added to a folder', async () => {
    const parts = [
      { name: 'report.pdf', bytes: CONTENT },
      { name: '.DS_Store', bytes: utf8('x') },
      { name: 'META-INF/signature.p7s', bytes: await makeCades(CONTENT, signer) },
    ];
    const { signatures, files } = await checkUnpacked(parts, parseXml);
    expect(signatures[0].verdict).toBe('intact');
    expect(files.map((file) => file.name)).toContain('.DS_Store');
  });

  it('keeps every timestamp, so that an added one cannot displace a real one', async () => {
    const xml = await makeXades(FILES, signer, {
      unsigned: async (value) => {
        const real = signatureTimestampXml(await makeTimestampToken(value, authority)).replace(/<\/?xades:Unsigned\w+>/g, '');
        const added = signatureTimestampXml(await makeTimestampToken(value, await makeSigner('Self Made'), { at: new Date(Date.UTC(1999, 0, 1)) })).replace(/<\/?xades:Unsigned\w+>/g, '');
        return unsignedXml(real + added);
      },
    });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].timestamps.map((stamp) => stamp.signedBy)).toEqual(['Test Authority', 'Self Made']);
  });
});

describe('findings from the fourth review', () => {
  const P7S = 'META-INF/signature.p7s';

  it('refuses the same key wrapped in a certificate with another name', async () => {
    // The value still verifies: only the signed digest says which certificate was meant.
    const impostor = await certificateFor('A Well-Known Name', signer, 'RSA', 2);
    const p7s = await makeCades(CONTENT, impostor, [], { bindTo: signer });
    const { signatures } = await check(container({ ...FILES, [P7S]: p7s }, ASIC_S));
    expect(signatures[0].verdict).toBe('broken');
    expect(signatures[0].signedBy).toBeNull();
    expect(signatures[0].covers).toEqual([]);
  });

  it('names nobody when nothing signed says whose certificate it is', async () => {
    const { signatures, files } = await check(container({ ...FILES, [P7S]: await makeCades(CONTENT, signer, [], { unbound: true }) }, ASIC_S));
    expect(signatures[0].verdict).toBe('cannot-check');
    expect(signatures[0].signedBy).toBeNull();
    expect(files[0].coveredBy).toEqual([]);
  });

  it('tries the signer after a certificate of another key type', async () => {
    const rsaCa = await makeSigner('RSA CA');
    const ecSigner = await makeSigner('EC Signer', 'EC');
    const xml = (await makeXades(FILES, ecSigner)).replace('<ds:X509Data>', `<ds:X509Data><ds:X509Certificate>${btoa(String.fromCharCode(...rsaCa.der))}</ds:X509Certificate>`);
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('intact');
    expect(signatures[0].signedBy).toBe('EC Signer');
  });

  it('does not call an archive manifest holding when part of it could not be compared', async () => {
    const MANIFEST = 'META-INF/ASiCManifest.xml';
    const TST = 'META-INF/timestamp001.tst';
    const manifest = await makeManifest('META-INF/signature001.p7s', FILES);
    const parts = { ...FILES, [MANIFEST]: manifest, 'META-INF/signature001.p7s': await makeCades(manifest, signer) };
    const archive = utf8(new TextDecoder().decode(await makeManifest(TST, parts)).replace(/Algorithm="[^"]+"/, 'Algorithm="urn:made-up"'));
    const { archives } = await check(container({ ...parts, 'META-INF/ASiCArchiveManifest.xml': archive, [TST]: await makeTimestampToken(archive, authority) }));
    expect(archives[0].standing).toBe('cannot-check');
  });

  it('reports an OCSP answer it cannot compare, rather than as no answer', async () => {
    const ocsp = await makeOcsp(signer, authority, { status: 'revoked', certIdHashOid: '2.16.840.1.101.3.4.2.8' });
    const answer = await revocationOf(signer.certificate, [], { ocsp: [ocsp], crl: [] });
    expect(answer).toMatchObject({ standing: 'cannot-check' });
  });
});

describe('findings from the fifth review', () => {
  const P7S = 'META-INF/signature.p7s';

  /** A CMS signature carrying the given tokens, each as its own attribute. */
  const withTokens = async (make: (value: Uint8Array) => Promise<asn1js.AsnType[]>) => {
    const signed = new SignedData({ schema: ContentInfo.fromBER((await makeCades(CONTENT, signer)).slice().buffer as ArrayBuffer).content });
    const value = new Uint8Array(signed.signerInfos[0].signature.valueBlock.valueHexView);
    signed.signerInfos[0].unsignedAttrs = new SignedAndUnsignedAttributes({
      type: 1,
      attributes: (await make(value)).map((token) => new Attribute({ type: '1.2.840.113549.1.9.16.2.14', values: [token] })),
    });
    return new Uint8Array(new ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: signed.toSchema(true) }).toSchema().toBER(false));
  };
  const asValue = (der: Uint8Array) => asn1js.fromBER(der.slice().buffer as ArrayBuffer).result;

  it('hands a CAdES signature\'s tokens to the screen, which looks only at that list', async () => {
    const p7s = await withTokens(async (value) => [asValue(await makeTimestampToken(value, authority))]);
    const { signatures } = await check(container({ ...FILES, [P7S]: p7s }, ASIC_S));
    expect(signatures[0].timestamps.map((stamp) => stamp.signedBy)).toEqual(['Test Authority']);
  });

  it('is not stopped by junk placed before a real token', async () => {
    const p7s = await withTokens(async (value) => [new asn1js.Null(), asValue(await makeTimestampToken(value, authority))]);
    const { signatures } = await check(container({ ...FILES, [P7S]: p7s }, ASIC_S));
    expect(signatures[0].timestamps.map((stamp) => stamp.signedBy)).toEqual(['Test Authority']);
  });

  it.each([['./'], ['/']])('finds a file named from the root as %s', async (prefix) => {
    const xml = await makeXades(FILES, signer, { references: [{ uri: `${prefix}${encodeURIComponent(NAME)}`, bytes: CONTENT }] });
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].verdict).toBe('intact');
  });

  it('shows a certificate name without the controls that disguise it', async () => {
    const xml = await makeXades(FILES, await makeSigner('Good\u202Eevil'));
    const { signatures } = await check(container({ ...FILES, [SIGNATURES]: xml }));
    expect(signatures[0].signedBy).toBe('Good\ufffdevil');
  });
});

