/**
 * Whether a trusted list carries a good signature from a certificate we were told to expect.
 *
 * The enveloped form every trusted list uses: the signature sits inside the document it signs,
 * and is taken out again to compute the document's digest. Runs on the build machine only.
 */
import { constants, createHash, createPublicKey, verify } from 'node:crypto';

import { DOMParser } from '@xmldom/xmldom';
import { Certificate } from 'pkijs';

import { canonicalize, isCanonicalization } from '../src/lib/document/verify/asic/c14n';
import { SIGNATURE_METHODS } from '../src/lib/document/verify/asic/xades';
import { childNamed, childrenNamed, decodeBase64, descendantsNamed, descendantsOf, digest, DIGESTS, DS, sameBytes } from '../src/lib/document/verify/asic/xml';

const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

const prefixesOf = (parent: Element): string[] =>
  descendantsNamed(parent, 'InclusiveNamespaces')[0]?.getAttribute('PrefixList')?.trim().split(/\s+/).filter(Boolean) ?? [];

export const parseList = (xml: string): Element => {
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message: string) => {
        throw new Error(message);
      },
      fatalError: (message: string) => {
        throw new Error(message);
      },
    },
  }).parseFromString(xml, 'text/xml') as unknown as Document;
  return document.documentElement;
};

export async function listSignature(xml: string, allowed: ReadonlySet<string>): Promise<{ ok: boolean; why: string }> {
  let root: Element;
  try {
    root = parseList(xml);
  } catch (error) {
    return { ok: false, why: `not XML: ${String(error).slice(0, 80)}` };
  }

  const signature = childNamed(root, 'Signature', DS);
  const signedInfo = signature && childNamed(signature, 'SignedInfo', DS);
  if (!signature || !signedInfo) return { ok: false, why: 'not signed' };

  const certificateText = descendantsNamed(childNamed(signature, 'KeyInfo', DS) ?? signature, 'X509Certificate')[0]?.textContent ?? '';
  const der = decodeBase64(certificateText);
  const print = createHash('sha256').update(der).digest('hex');
  if (!allowed.has(print)) return { ok: false, why: `signed by a certificate not expected (${print.slice(0, 12)})` };

  // By Node rather than WebCrypto: Germany's list is signed with an id-RSASSA-PSS key, which
  // WebCrypto refuses to import. The value first, and the digests only if it holds.
  const method = SIGNATURE_METHODS[childNamed(signedInfo, 'SignatureMethod', DS)?.getAttribute('Algorithm') ?? ''];
  const canonicalization = childNamed(signedInfo, 'CanonicalizationMethod', DS);
  const value = childNamed(signature, 'SignatureValue', DS);
  if (!method || !canonicalization || !value) return { ok: false, why: 'unknown signature method' };

  const certificate = Certificate.fromBER(der.slice().buffer as ArrayBuffer);
  const key = createPublicKey({ key: Buffer.from(certificate.subjectPublicKeyInfo.toSchema().toBER(false)), format: 'der', type: 'spki' });
  const holds = verify(
    method.hash.replace('-', '').toLowerCase(),
    canonicalize(signedInfo, canonicalization.getAttribute('Algorithm') ?? '', prefixesOf(canonicalization)),
    method.kind === 'EC'
      ? { key, dsaEncoding: 'ieee-p1363' }
      : method.kind === 'PSS'
        ? { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: method.salt }
        : key,
    decodeBase64(value.textContent ?? ''),
  );
  if (!holds) return { ok: false, why: 'the signature value does not verify' };

  const references = childrenNamed(signedInfo, 'Reference', DS);
  let coversDocument = false;
  const whole: Array<{ algorithm: string; prefixes: string[]; hash: string; expected: Uint8Array }> = [];

  for (const reference of references) {
    const hash = DIGESTS[childNamed(reference, 'DigestMethod', DS)?.getAttribute('Algorithm') ?? ''];
    if (!hash) return { ok: false, why: 'unknown digest' };
    const expected = decodeBase64(childNamed(reference, 'DigestValue', DS)?.textContent ?? '');
    const transforms = childNamed(reference, 'Transforms', DS);
    const algorithms = transforms ? childrenNamed(transforms, 'Transform', DS).map((t) => t.getAttribute('Algorithm') ?? '') : [];
    const rendering = algorithms.find((algorithm) => algorithm !== ENVELOPED) ?? '';
    if (!isCanonicalization(rendering)) return { ok: false, why: `unknown transform ${rendering}` };

    const uri = reference.getAttribute('URI') ?? '';
    const rootId = root.getAttribute('Id') ?? root.getAttribute('TSLTag');
    if (uri === '' || uri === `#${root.getAttribute('Id')}` || uri === `#${rootId}`) {
      if (!algorithms.includes(ENVELOPED)) return { ok: false, why: 'the document reference is not enveloped' };
      coversDocument = true;
      whole.push({ algorithm: rendering, prefixes: [], hash, expected });
      continue;
    }

    const targets = [...descendantsOf(signature)].filter((element) => element.getAttribute('Id') === uri.slice(1));
    if (targets.length !== 1) return { ok: false, why: `cannot resolve ${uri}` };
    if (!sameBytes(await digest(hash, canonicalize(targets[0], rendering)), expected)) return { ok: false, why: `${uri} does not match` };
  }
  if (!coversDocument) return { ok: false, why: 'it does not sign the document' };

  root.removeChild(signature as unknown as ChildNode);
  for (const { algorithm, prefixes, hash, expected } of whole) {
    if (!sameBytes(await digest(hash, canonicalize(root, algorithm, prefixes)), expected)) return { ok: false, why: 'the document does not match' };
  }
  return { ok: true, why: '' };
}
