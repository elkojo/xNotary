/**
 * An XAdES signature inside a container, checked.
 *
 * The order is the whole of the logic, and it is why this is a walk rather than a
 * call to a signature library:
 *
 *  1. **The signature value first.** The digests that say what was signed sit in
 *     `SignedInfo`, and until the signature over `SignedInfo` verifies they are
 *     just text somebody may have edited. A broken signature therefore says
 *     nothing about the files — reporting "this file changed" on the strength of
 *     it would be a claim with no evidence.
 *  2. **Then what it signed.** Each reference, reported separately, because "the
 *     contract changed" and "the signing time changed" are not the same news.
 *  3. **Then whether it says anything.** A signature can be sound and cover none
 *     of the files. Only the files it actually matched are reported as covered.
 *
 * **Wrapping.** The classic attack on XML signatures keeps a correctly signed
 * element somewhere in the file and adds an unsigned one for readers to believe.
 * So an internal reference must resolve to exactly one element inside this one
 * signature, and every fact shown — the time, the certificate binding — is read
 * from that same element, not looked up afresh. Anything else is ignored.
 *
 * **Attribution.** `KeyInfo` is outside what most signatures cover, so the
 * certificate there proves nothing by being there. The signer is the one whose
 * digest the signed properties state and whose key verifies the signature.
 *
 * **Counter-signatures** are signatures in their own right, nested in the unsigned
 * properties of the one they sign, and go through this same walk. What differs is
 * one reference: it points outside the nested signature, at its parent's
 * `SignatureValue`, and that is resolved to exactly that element and no other.
 *
 * Status is only reported on evidence: whatever this cannot complete, an algorithm
 * or a transform it does not have, comes back `cannot-check` and never `intact`.
 */
import { Certificate } from 'pkijs';

import { factsFor, worstTimestamp, readTimestampToken, timestampTokenFrom, type AttachedTimestamp } from '../signer';
import { C14N_10, canonicalize, isCanonicalization } from './c14n';
import { revocationOf, type EmbeddedRevocation } from './revocation';
import { blankSignature, type ContainerSignature, type ContainerVerdict } from './types';
import { childNamed, childrenNamed, decodeBase64, descendantsNamed, descendantsOf, digest, DIGESTS, DS, fileNamed, sameBytes } from './xml';

const M = 'http://www.w3.org/2001/04/xmldsig-more#';
const M07 = 'http://www.w3.org/2007/05/xmldsig-more#';
const COUNTERSIGNED = 'http://uri.etsi.org/01903#CountersignedSignature';

export type Method = { readonly kind: 'RSA' | 'EC' | 'PSS'; readonly hash: string; readonly salt?: number };

export const SIGNATURE_METHODS: Record<string, Method> = {
  'http://www.w3.org/2000/09/xmldsig#rsa-sha1': { kind: 'RSA', hash: 'SHA-1' },
  [`${M}rsa-sha256`]: { kind: 'RSA', hash: 'SHA-256' },
  [`${M}rsa-sha384`]: { kind: 'RSA', hash: 'SHA-384' },
  [`${M}rsa-sha512`]: { kind: 'RSA', hash: 'SHA-512' },
  [`${M}ecdsa-sha1`]: { kind: 'EC', hash: 'SHA-1' },
  [`${M}ecdsa-sha256`]: { kind: 'EC', hash: 'SHA-256' },
  [`${M}ecdsa-sha384`]: { kind: 'EC', hash: 'SHA-384' },
  [`${M}ecdsa-sha512`]: { kind: 'EC', hash: 'SHA-512' },
  [`${M07}sha256-rsa-MGF1`]: { kind: 'PSS', hash: 'SHA-256', salt: 32 },
  [`${M07}sha384-rsa-MGF1`]: { kind: 'PSS', hash: 'SHA-384', salt: 48 },
  [`${M07}sha512-rsa-MGF1`]: { kind: 'PSS', hash: 'SHA-512', salt: 64 },
};

const CURVES: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
};

const lastPart = (uri: string | null | undefined): string => (uri ?? 'unknown').split(/[#/]/).pop() || 'unknown';

const prefixListOf = (parent: Element | undefined): string[] => {
  if (!parent) return [];
  const list = descendantsNamed(parent, 'InclusiveNamespaces')[0]?.getAttribute('PrefixList');
  return list?.trim().split(/\s+/).filter(Boolean) ?? [];
};

type ReferenceResult =
  | { readonly status: 'match'; readonly file?: string; readonly target?: Element; readonly counterSigned?: boolean }
  | { readonly status: 'mismatch'; readonly file?: string; readonly target?: Element; readonly counterSigned?: boolean }
  | { readonly status: 'missing'; readonly file: string }
  | { readonly status: 'cannot-check'; readonly why: string };

async function checkReference(
  reference: Element,
  signature: Element,
  files: ReadonlyMap<string, Uint8Array>,
  parent: Element | null = null,
): Promise<ReferenceResult> {
  const uri = reference.getAttribute('URI');
  if (!uri) return { status: 'cannot-check', why: 'It signs something it does not name.' };

  const method = childNamed(reference, 'DigestMethod', DS)?.getAttribute('Algorithm');
  const hash = method ? DIGESTS[method] : undefined;
  if (!hash) return { status: 'cannot-check', why: `It uses ${lastPart(method)}, a digest this browser cannot compute.` };

  const expected = decodeBase64(childNamed(reference, 'DigestValue', DS)?.textContent ?? '');
  const transformList = childNamed(reference, 'Transforms', DS);
  const transforms = transformList ? childrenNamed(transformList, 'Transform', DS) : [];

  const counterSigned = reference.getAttribute('Type') === COUNTERSIGNED;
  if (counterSigned && !(parent && uri.startsWith('#'))) {
    return { status: 'cannot-check', why: 'It counter-signs a signature from outside it, by a route this check does not follow.' };
  }

  if (!uri.startsWith('#')) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
      return { status: 'cannot-check', why: 'It signs something outside the container.' };
    }
    if (transforms.length > 0) {
      return { status: 'cannot-check', why: 'It transforms a file before signing it, which this check does not do.' };
    }
    const file = fileNamed(uri, files);
    if (!file) {
      let named = uri;
      try {
        named = decodeURIComponent(uri);
      } catch {
        // As above.
      }
      return { status: 'missing', file: named };
    }
    const actual = await digest(hash, files.get(file)!);
    return { status: sameBytes(actual, expected) ? 'match' : 'mismatch', file };
  }

  // Exactly one element, inside this signature. See the note on wrapping above.
  const id = uri.slice(1);
  const parentValue = counterSigned ? childNamed(parent!, 'SignatureValue', DS) : undefined;
  const targets = counterSigned
    ? parentValue && parentValue.getAttribute('Id') === id
      ? [parentValue]
      : []
    : [...descendantsOf(signature)].filter((element) =>
        ['Id', 'ID', 'id'].some((attribute) => element.getAttribute(attribute) === id),
      );
  if (targets.length !== 1) {
    return {
      status: 'cannot-check',
      why:
        targets.length === 0
          ? 'It signs an element that is not in the signature.'
          : 'Two elements in it claim to be the one it signed, which is how a signature is made to vouch for something it never saw.',
    };
  }

  let algorithm = C14N_10;
  let prefixes: string[] = [];
  for (const transform of transforms) {
    const named = transform.getAttribute('Algorithm') ?? '';
    if (!isCanonicalization(named)) {
      return { status: 'cannot-check', why: `It applies ${lastPart(named)} before signing, which this check does not do.` };
    }
    algorithm = named;
    prefixes = prefixListOf(transform);
  }

  const target = targets[0];
  const actual = await digest(hash, canonicalize(target, algorithm, prefixes));
  return { status: sameBytes(actual, expected) ? 'match' : 'mismatch', target, counterSigned };
}

/**
 * A `ds:Manifest` it signed: an indirect list of files.
 *
 * Only worth reading once its own digest has matched, which is why it is read
 * here and not along with the references beside it.
 */
async function checkManifest(
  manifest: Element,
  signature: Element,
  files: ReadonlyMap<string, Uint8Array>,
): Promise<ReferenceResult[]> {
  const results: ReferenceResult[] = [];
  for (const reference of childrenNamed(manifest, 'Reference', DS)) {
    results.push(await checkReference(reference, signature, files));
  }
  return results;
}

async function verifySignatureValue(
  signedInfo: Element,
  signature: Element,
  certificate: Certificate,
  method: Method,
): Promise<boolean | 'cannot-check'> {
  const canonicalization = childNamed(signedInfo, 'CanonicalizationMethod', DS);
  const value = childNamed(signature, 'SignatureValue', DS);
  if (!canonicalization || !value) return false;

  const spki = certificate.subjectPublicKeyInfo.toSchema().toBER(false);
  let key: CryptoKey;
  let parameters: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
  try {
    if (method.kind === 'EC') {
      const params = certificate.subjectPublicKeyInfo.algorithm.algorithmParams as { valueBlock?: { toString(): string } } | undefined;
      const curve = CURVES[params?.valueBlock?.toString() ?? ''];
      if (!curve) return 'cannot-check';
      key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: curve }, false, ['verify']);
      parameters = { name: 'ECDSA', hash: method.hash };
    } else {
      const name = method.kind === 'RSA' ? 'RSASSA-PKCS1-v1_5' : 'RSA-PSS';
      key = await crypto.subtle.importKey('spki', spki, { name, hash: method.hash }, false, ['verify']);
      parameters = method.kind === 'RSA' ? { name } : { name, saltLength: method.salt! };
    }
  } catch {
    return 'cannot-check';
  }

  const canonical = canonicalize(
    signedInfo,
    canonicalization.getAttribute('Algorithm') ?? '',
    prefixListOf(canonicalization),
  );
  const raw = decodeBase64(value.textContent ?? '');
  return crypto.subtle.verify(parameters, key, raw.slice().buffer as ArrayBuffer, canonical.slice().buffer as ArrayBuffer);
}

/** Every certificate it carries that parses. An empty element is not one. */
function certificatesIn(signature: Element): Array<{ certificate: Certificate; der: Uint8Array }> {
  const elements = [...descendantsOf(signature)].filter(
    (element) => element.localName === 'X509Certificate' || element.localName === 'EncapsulatedX509Certificate',
  );
  const found: Array<{ certificate: Certificate; der: Uint8Array }> = [];
  for (const element of elements) {
    try {
      const der = decodeBase64(element.textContent ?? '');
      if (der.length === 0) continue;
      found.push({ certificate: Certificate.fromBER(der.slice().buffer as ArrayBuffer), der });
    } catch {
      // One unreadable certificate does not spoil the others.
    }
  }
  return found;
}

/** The certificates whose digest the signed properties state. */
async function boundCertificates(
  signedProperties: Element,
  carried: ReadonlyArray<{ certificate: Certificate; der: Uint8Array }>,
): Promise<{ readonly bound: Certificate[]; readonly checkable: boolean }> {
  const statement =
    descendantsNamed(signedProperties, 'SigningCertificateV2')[0] ??
    descendantsNamed(signedProperties, 'SigningCertificate')[0];
  const digests = statement ? descendantsNamed(statement, 'CertDigest') : [];

  const bound: Certificate[] = [];
  let checkable = digests.length > 0;
  for (const stated of digests) {
    const hash = DIGESTS[childNamed(stated, 'DigestMethod', DS)?.getAttribute('Algorithm') ?? ''];
    if (!hash) {
      checkable = false;
      continue;
    }
    const expected = decodeBase64(childNamed(stated, 'DigestValue', DS)?.textContent ?? '');
    for (const { certificate, der } of carried) {
      if (sameBytes(await digest(hash, der), expected) && !bound.includes(certificate)) bound.push(certificate);
    }
  }
  return { bound, checkable };
}

/**
 * This signature's own unsigned properties, in order.
 *
 * Only its own: a nested counter-signature has a timestamp and revocation values of
 * its own, and searching all descendants would credit them to its parent.
 */
function unsignedPropertiesOf(qualifying: Element): Element[] {
  const found: Element[] = [];
  for (const unsigned of childrenNamed(qualifying, 'UnsignedProperties')) {
    for (const properties of childrenNamed(unsigned, 'UnsignedSignatureProperties')) {
      for (let child = properties.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) found.push(child as Element);
      }
    }
  }
  return found;
}

/** The `QualifyingProperties` directly in this signature's objects. */
function qualifyingOf(signature: Element): Element | undefined {
  for (const object of childrenNamed(signature, 'Object', DS)) {
    const found = childNamed(object, 'QualifyingProperties');
    if (found) return found;
  }
  return undefined;
}

/** The signatures nested as counter-signatures directly under this one. */
export function counterSignatureElements(signature: Element): Element[] {
  const qualifying = qualifyingOf(signature);
  if (!qualifying) return [];
  return unsignedPropertiesOf(qualifying)
    .filter((property) => property.localName === 'CounterSignature')
    .flatMap((property) => childrenNamed(property, 'Signature', DS));
}

/** The revocation values among its unsigned properties. */
function revocationIn(properties: readonly Element[]): EmbeddedRevocation {
  const values = properties.filter((property) => property.localName === 'RevocationValues');
  const encapsulated = (name: string) =>
    values.flatMap((element) => descendantsNamed(element, name)).flatMap((element) => {
      try {
        return [decodeBase64(element.textContent ?? '')];
      } catch {
        return [];
      }
    });
  return { ocsp: encapsulated('EncapsulatedOCSPValue'), crl: encapsulated('EncapsulatedCRLValue') };
}

/**
 * The timestamps over this signature's value: the worst one's standing, if there
 * are several.
 *
 * A token that names no canonicalization means inclusive 1.0 by the standard, and
 * real writers omit the element having used the signature's own method instead. So
 * in that one case both are tried. It concedes nothing: every rendering of
 * `SignatureValue` holds the same value, so either way the token attests to this
 * signature. A token that does name a method is held to it.
 */
async function timestampsOf(properties: readonly Element[], signature: Element, signedInfo: Element): Promise<AttachedTimestamp[]> {
  const value = childNamed(signature, 'SignatureValue', DS);
  if (!value) return [];
  const signedWith = childNamed(signedInfo, 'CanonicalizationMethod', DS);

  const found: AttachedTimestamp[] = [];
  for (const stamp of properties.filter((property) => property.localName === 'SignatureTimeStamp')) {
    const named = childNamed(stamp, 'CanonicalizationMethod', DS);
    const renderings: Array<[string, string[]]> = named
      ? [[named.getAttribute('Algorithm') ?? '', prefixListOf(named)]]
      : [
          [C14N_10, []],
          [signedWith?.getAttribute('Algorithm') ?? C14N_10, prefixListOf(signedWith)],
        ];

    // All of them: junk placed in front must not hide a real one.
    for (const token of descendantsNamed(stamp, 'EncapsulatedTimeStamp')) {
      try {
        const parsed = timestampTokenFrom(decodeBase64(token.textContent ?? ''));
        let read: AttachedTimestamp | null = null;
        for (const [algorithm, prefixes] of renderings) {
          if (!isCanonicalization(algorithm)) continue;
          read = await readTimestampToken(parsed, canonicalize(value, algorithm, prefixes));
          if (read?.standing !== 'other-signature') break;
        }
        if (read) found.push(read);
      } catch {
        // Not a token. Nothing here dated it.
      }
    }
  }
  return found;
}

/** The bytes a reference stands for, after its transforms, for an archive timestamp. */
function bytesOfReference(reference: Element, signature: Element, files: ReadonlyMap<string, Uint8Array>): Uint8Array | null {
  const uri = reference.getAttribute('URI');
  if (!uri) return null;
  const transformList = childNamed(reference, 'Transforms', DS);
  const transforms = transformList ? childrenNamed(transformList, 'Transform', DS) : [];

  if (!uri.startsWith('#')) {
    if (transforms.length > 0) return null;
    const file = fileNamed(uri, files);
    return file ? files.get(file)! : null;
  }

  const id = uri.slice(1);
  const targets = [...descendantsOf(signature)].filter((element) => ['Id', 'ID', 'id'].some((attribute) => element.getAttribute(attribute) === id));
  if (targets.length !== 1) return null;

  let algorithm = C14N_10;
  let prefixes: string[] = [];
  for (const transform of transforms) {
    const named = transform.getAttribute('Algorithm') ?? '';
    if (!isCanonicalization(named)) return null;
    algorithm = named;
    prefixes = prefixListOf(transform);
  }
  return canonicalize(targets[0], algorithm, prefixes);
}

/**
 * What an archive timestamp covers, reassembled, or null when part of it cannot be.
 *
 * It is not stored anywhere. It is built, in order, from everything it protects
 * (EN 319 132-1, 5.5.2): each reference's data, `SignedInfo`, `SignatureValue`,
 * `KeyInfo`, the unsigned properties before it, then the other `ds:Object`s.
 */
export function archiveInput(
  stamp: Element,
  position: number,
  properties: readonly Element[],
  signature: Element,
  signedInfo: Element,
  qualifying: Element,
  files: ReadonlyMap<string, Uint8Array>,
): Uint8Array | null {
  const named = childNamed(stamp, 'CanonicalizationMethod', DS);
  const algorithm = named?.getAttribute('Algorithm') ?? C14N_10;
  if (!isCanonicalization(algorithm)) return null;
  const prefixes = prefixListOf(named);
  const render = (element: Element | undefined) => (element ? canonicalize(element, algorithm, prefixes) : new Uint8Array(0));

  const parts: Array<Uint8Array | null> = [];
  for (const reference of childrenNamed(signedInfo, 'Reference', DS)) parts.push(bytesOfReference(reference, signature, files));
  parts.push(render(signedInfo), render(childNamed(signature, 'SignatureValue', DS)), render(childNamed(signature, 'KeyInfo', DS)));
  for (const property of properties.slice(0, position)) parts.push(render(property));
  for (const object of childrenNamed(signature, 'Object', DS)) {
    if (childNamed(object, 'QualifyingProperties') !== qualifying) parts.push(render(object));
  }
  return parts.every((part) => part !== null) ? concatenated(parts as Uint8Array[]) : null;
}

/**
 * Archive timestamps inside this signature.
 *
 * Anything this cannot reassemble is `cannot-check`, and a mismatch is reported as
 * no more than that: see `archiveTimestamps` in `types.ts`.
 */
async function archiveTimestampsOf(
  properties: readonly Element[],
  signature: Element,
  signedInfo: Element,
  qualifying: Element,
  files: ReadonlyMap<string, Uint8Array>,
): Promise<AttachedTimestamp[]> {
  const found: AttachedTimestamp[] = [];
  for (const [position, stamp] of properties.entries()) {
    if (stamp.localName !== 'ArchiveTimeStamp') continue;
    const whole = archiveInput(stamp, position, properties, signature, signedInfo, qualifying, files);
    for (const token of descendantsNamed(stamp, 'EncapsulatedTimeStamp')) {
      let parsed;
      try {
        parsed = timestampTokenFrom(decodeBase64(token.textContent ?? ''));
      } catch {
        continue;
      }
      // Reassembly it could not do says nothing about the token, so nothing bad is implied.
      const read = await readTimestampToken(parsed, whole ?? new Uint8Array(1));
      if (read) found.push(whole ? read : { ...read, standing: 'cannot-check' });
    }
  }
  return found;
}

function concatenated(parts: readonly Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.length;
  }
  return whole;
}

/** One `ds:Signature`, and everything that can be established about it. */
export async function checkXades(
  signature: Element,
  source: string,
  files: ReadonlyMap<string, Uint8Array>,
  dataFiles: ReadonlySet<string>,
  parent: Element | null = null,
): Promise<ContainerSignature> {
  const blank = blankSignature(source, 'XAdES');
  const verdict = (value: ContainerVerdict, detail: string): ContainerSignature => ({ ...blank, verdict: value, detail });

  const signedInfo = childNamed(signature, 'SignedInfo', DS);
  if (!signedInfo) return verdict('unreadable', 'It has no signed part to read.');

  const methodUri = childNamed(signedInfo, 'SignatureMethod', DS)?.getAttribute('Algorithm');
  const method = methodUri ? SIGNATURE_METHODS[methodUri] : undefined;
  const canonicalization = childNamed(signedInfo, 'CanonicalizationMethod', DS)?.getAttribute('Algorithm');
  if (!canonicalization || !isCanonicalization(canonicalization)) {
    return verdict('cannot-check', `It uses ${lastPart(canonicalization)}, which this check does not read.`);
  }

  let references: ReferenceResult[] = [];
  const direct = childrenNamed(signedInfo, 'Reference', DS);
  for (const reference of direct) references.push(await checkReference(reference, signature, files, parent));

  const signedProperties = references.flatMap((result) =>
    'target' in result && result.target?.localName === 'SignedProperties' ? [result] : [],
  )[0];

  const carried = certificatesIn(signature);
  const qualifying = qualifyingOf(signature);
  const properties = qualifying ? unsignedPropertiesOf(qualifying) : [];

  const described = {
    ...blank,
    certificateCount: carried.length,
  };

  if (!method) {
    return { ...described, verdict: 'cannot-check', detail: `It uses ${lastPart(methodUri)}, a signature this browser cannot check.` };
  }
  if (carried.length === 0) {
    return { ...described, verdict: 'cannot-check', detail: 'It carries no certificate to check it against.' };
  }

  // Without signed properties that still match, there is no statement of whose
  // certificate this is. Every carried one is then only a candidate, and none gets
  // the name: a digest inside an edited element is not evidence of anything.
  const binding = signedProperties?.status === 'match'
    ? await boundCertificates(signedProperties.target!, carried)
    : { bound: [] as Certificate[], checkable: false };
  const others = carried.map((entry) => entry.certificate);

  const candidates = binding.bound.length > 0 ? binding.bound : others;
  let holder: Certificate | null = null;
  let verified: boolean | 'cannot-check' = false;
  let unsupported = false;
  for (const candidate of candidates) {
    verified = await verifySignatureValue(signedInfo, signature, candidate, method);
    if (verified === true) {
      holder = candidate;
      break;
    }
    // A certificate of another key type says nothing about the next one, which may be the signer's.
    if (verified === 'cannot-check') unsupported = true;
  }

  if (!holder && unsupported) {
    return { ...described, verdict: 'cannot-check', detail: 'It uses a key or a curve this browser cannot check.' };
  }
  if (!holder) {
    return {
      ...described,
      verdict: 'broken',
      detail: 'It does not check out against the certificate it carries.',
    };
  }

  // The value holds, so `SignedInfo` is what was signed and its digests mean something.
  const bound = binding.bound.includes(holder);
  const facts = await factsFor(bound ? holder : null, others, carried.length);
  const withFacts = { ...described, ...facts };

  const manifests = references.flatMap((result) =>
    'target' in result && result.status === 'match' && result.target?.localName === 'Manifest' && result.target.namespaceURI === DS
      ? [result.target]
      : [],
  );
  for (const manifest of manifests) references = references.concat(await checkManifest(manifest, signature, files));

  const inContainer = (name: string) => dataFiles.has(name);
  const changed = references.flatMap((result) => (result.status === 'mismatch' && result.file ? [result.file] : []));
  const missing = references.flatMap((result) => (result.status === 'missing' ? [result.file] : []));
  const covers = [...new Set(references.flatMap((result) => (result.status === 'match' && result.file && inContainer(result.file) ? [result.file] : [])))];
  const isCounterReference = (result: ReferenceResult) => 'counterSigned' in result && result.counterSigned === true;
  const counterChanged = references.some((result) => result.status === 'mismatch' && isCounterReference(result));
  const counterHolds = references.some((result) => result.status === 'match' && isCounterReference(result));
  const detailsChanged = references.some((result) => result.status === 'mismatch' && !result.file && !isCounterReference(result));
  const unreadable = references.flatMap((result) => (result.status === 'cannot-check' ? [result.why] : []));

  const details = signedProperties?.status === 'match' ? signedProperties.target! : null;
  const stated = details ? descendantsNamed(details, 'SigningTime')[0]?.textContent?.trim() : undefined;
  const parsed = stated ? new Date(stated) : null;
  const timestamps = await timestampsOf(properties, signature, signedInfo);
  const report = {
    ...withFacts,
    covers,
    changed,
    missing,
    detailsChanged,
    counterChanged,
    time: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
    timestamps,
    timestamp: worstTimestamp(timestamps),
    revocation: bound ? await revocationOf(holder, others, revocationIn(properties)) : null,
    carriedEvidence: bound ? { embedded: revocationIn(properties), certificates: others } : null,
    archiveTimestamps: qualifying ? await archiveTimestampsOf(properties, signature, signedInfo, qualifying, files) : [],
    detail: '',
  };

  if (changed.length > 0 || missing.length > 0 || detailsChanged || counterChanged) return { ...report, verdict: 'altered' };
  if (unreadable.length > 0) return { ...report, verdict: 'cannot-check', detail: unreadable[0] };
  if (!signedProperties) {
    return { ...report, verdict: 'cannot-check', detail: 'Nothing it signed says whose certificate this is, so it names nobody.' };
  }
  if (!binding.checkable) {
    return { ...report, verdict: 'cannot-check', detail: 'It does not state a certificate digest this browser can compute, so it names nobody.' };
  }
  if (!bound) {
    return { ...report, verdict: 'broken', detail: 'The certificate it was checked against is not the one its signed details name.' };
  }
  if (parent) {
    return counterHolds
      ? { ...report, verdict: 'intact' }
      : { ...report, verdict: 'cannot-check', detail: 'It is attached to a signature it does not sign.' };
  }
  if (covers.length === 0) return { ...report, verdict: 'covers-nothing' };
  return { ...report, verdict: 'intact' };
}
