/**
 * CMS inside a container: a CAdES signature or an RFC 3161 token.
 *
 * In ASiC-E it sits over an `ASiCManifest`, which in turn lists the files by digest,
 * so the chain of evidence runs signature → manifest → files. In ASiC-S there is no
 * manifest: it sits directly over the one file at the container's root.
 *
 * Either way every link has to hold, and a mismatch means something only once the
 * signature has been shown to hold. As in `xades.ts`, a broken signature says
 * nothing about the files, and names nobody.
 */
import { Certificate, SignedData, SignerInfo } from 'pkijs';

import {
  certificateForSid,
  checkSigner,
  embeddedTimestampsOf,
  worstTimestamp,
  factsFor,
  hashForOid,
  readTimestampToken,
  readTstInfo,
  bindingIn,
  signatureValueHolds,
  signedDataFrom,
  signingCertificateBinding,
  signerFactsOf,
} from '../signer';
import { revocationInCms, revocationOf } from './revocation';
import { blankSignature, type ContainerSignature, type ParseXml, type UncheckedPart } from './types';
import { childNamed, decodeBase64, descendantsNamed, digest, DIGESTS, DS, fileNamed, parseXmlBytes, sameBytes } from './xml';

const SIGNING_TIME = '1.2.840.113549.1.9.5';
const MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const COUNTER_SIGNATURE = '1.2.840.113549.1.9.6';
/** `id-aa-ets-archiveTimestampV2`, `-V3`: long-term protection inside the CMS, not read. */
const ARCHIVE_ATTRIBUTES = ['1.2.840.113549.1.9.16.2.48', '0.4.0.1733.2.4'];

export type ListedFiles = { covers: string[]; changed: string[]; missing: string[]; cannotCheck: string | null };

const decodedUri = (uri: string): string => {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
};

const certificatesOf = (signed: SignedData): Certificate[] =>
  (signed.certificates ?? []).filter((candidate): candidate is Certificate => candidate instanceof Certificate);

const formOf = (name: string): ContainerSignature['form'] => (/\.tst$/i.test(name) ? 'timestamp' : 'CAdES');

/** Each file a manifest lists, against the bytes in the container. */
export async function readListedFiles(
  root: Element,
  files: ReadonlyMap<string, Uint8Array>,
  counted: ReadonlySet<string>,
): Promise<ListedFiles> {
  const result: ListedFiles = { covers: [], changed: [], missing: [], cannotCheck: null };
  for (const listed of descendantsNamed(root, 'DataObjectReference')) {
    const uri = listed.getAttribute('URI') ?? '';
    const name = fileNamed(uri, files);
    if (!name) {
      result.missing.push(decodedUri(uri));
      continue;
    }
    const bytes = files.get(name)!;

    const method = childNamed(listed, 'DigestMethod', DS)?.getAttribute('Algorithm') ?? '';
    const hash = DIGESTS[method];
    if (!hash) {
      result.cannotCheck = 'It lists a file by a digest this browser cannot compute.';
      continue;
    }
    const expected = decodeBase64(childNamed(listed, 'DigestValue', DS)?.textContent ?? '');
    if (!sameBytes(await digest(hash, bytes), expected)) result.changed.push(name);
    else if (counted.has(name)) result.covers.push(name);
  }
  return result;
}

/** The signature file a manifest points to, by the name it gives. */
export const signatureNamedIn = (root: Element): string => {
  const reference = descendantsNamed(root, 'SigReference')[0]?.getAttribute('URI');
  return reference ? decodedUri(reference) : '';
};

function parseSigned(bytes: Uint8Array): SignedData | null {
  try {
    return signedDataFrom(bytes);
  } catch {
    return null;
  }
}

/** One manifest, as however many signatures its reference holds. */
export async function checkManifest(
  source: string,
  files: ReadonlyMap<string, Uint8Array>,
  dataFiles: ReadonlySet<string>,
  parse: ParseXml,
): Promise<ContainerSignature[]> {
  const manifestBytes = files.get(source)!;

  let root: Element;
  try {
    root = parseXmlBytes(manifestBytes, parse).documentElement;
  } catch {
    return [{ ...blankSignature(source, 'CAdES'), verdict: 'unreadable', detail: 'Its list of signed files could not be read.' }];
  }

  const signatureName = signatureNamedIn(root);
  const signatureFile = files.get(signatureName);
  if (!signatureFile) {
    return [
      {
        ...blankSignature(source, formOf(signatureName)),
        verdict: 'unreadable',
        detail: 'The signature its list of files points to is not in the container.',
      },
    ];
  }

  const listed = await readListedFiles(root, files, dataFiles);
  // On a mismatch the signature is over a different list than this one: the list changed.
  return checkCms(signatureName, signatureFile, manifestBytes, listed, { detailsChanged: true });
}

/**
 * A signature that names no list: ASiC-S, where it sits directly over the one file
 * at the root.
 *
 * It names nothing, so which file it covers comes from the container's shape. With
 * several at the root the shape does not say, and picking one would be a guess.
 */
export async function checkDetached(
  signatureName: string,
  files: ReadonlyMap<string, Uint8Array>,
  rootFiles: readonly string[],
): Promise<ContainerSignature[]> {
  if (rootFiles.length !== 1) {
    return [
      {
        ...blankSignature(signatureName, formOf(signatureName)),
        // Nothing was verified, so this cannot say what it does or does not sign.
        verdict: 'cannot-check',
        detail:
          rootFiles.length === 0
            ? 'It does not say what it signs, and there is no file at the top of the container for it to be over.'
            : `It does not say which of the ${rootFiles.length} files here it signs.`,
      },
    ];
  }

  const [name] = rootFiles;
  const listed: ListedFiles = { covers: [name], changed: [], missing: [], cannotCheck: null };
  return checkCms(signatureName, files.get(signatureName)!, files.get(name)!, listed, { changed: [name] });
}

/** Check a CMS structure over `content`, and report on the files that rests on. */
async function checkCms(
  signatureName: string,
  bytes: Uint8Array,
  content: Uint8Array,
  listed: ListedFiles,
  onMismatch: Partial<ContainerSignature>,
): Promise<ContainerSignature[]> {
  const form = formOf(signatureName);
  const signed = parseSigned(bytes);
  if (!signed) return [{ ...blankSignature(signatureName, form), verdict: 'unreadable', detail: 'The signature could not be read.' }];

  if (form === 'timestamp') {
    const stamp = await readTimestampToken(signed, content);
    const standing = stamp?.standing ?? 'cannot-check';
    return [
      finish(
        { ...blankSignature(signatureName, form), ...(await signerFactsOf(signed, 0)), time: readTstInfo(signed)?.genTime ?? null },
        listed,
        standing === 'holds' ? 'holds' : standing === 'other-signature' ? 'digest-mismatch' : standing === 'broken' ? 'bad-signature' : 'cannot-check',
        onMismatch,
      ),
    ];
  }

  const results: ContainerSignature[] = [];
  const signerCount = Math.max(signed.signerInfos.length, 1);
  for (let index = 0; index < signerCount; index++) {
    const facts = await signerFactsOf(signed, index);
    const signedAttributes = signed.signerInfos[index]?.signedAttrs?.attributes ?? [];
    const signingTime = signedAttributes.find((attribute) => attribute.type === SIGNING_TIME)?.values[0] as { toDate?: () => Date } | undefined;
    const unsigned = signed.signerInfos[index]?.unsignedAttrs?.attributes ?? [];
    const unchecked: UncheckedPart[] = unsigned.some((attribute) => ARCHIVE_ATTRIBUTES.includes(attribute.type)) ? ['archive-timestamp'] : [];

    const stamps = await embeddedTimestampsOf(signed, index);
    const value = await checkSigner(signed, index, content);
    // A container's CAdES has to bind its certificate, as a baseline signature does. Without that the
    // name is only what an unsigned bundle says, which is why XAdES refuses the same thing.
    const binding = value === 'holds' && facts.certificate ? await signingCertificateBinding(signed, index, facts.certificate) : 'bound';
    if (binding !== 'bound') {
      results.push({
        ...blankSignature(signatureName, form),
        certificateCount: facts.certificateCount,
        verdict: binding === 'unbound' ? 'broken' : 'cannot-check',
        detail:
          binding === 'unbound'
            ? 'The certificate it carries is not the one its signed details name.'
            : 'Nothing it signed says whose certificate this is, so it names nobody.',
      });
      results.push(...(await counterSignaturesOf(signed, index, signatureName, results.length - 1)));
      continue;
    }
    const check = value;
    results.push(
      finish(
        {
          ...blankSignature(signatureName, form),
          ...facts,
          time: signingTime?.toDate?.() ?? null,
          timestamps: stamps,
          timestamp: worstTimestamp(stamps),
          revocation: facts.certificate ? await revocationOf(facts.certificate, certificatesOf(signed), revocationInCms(signed, index)) : null,
          unchecked,
        },
        listed,
        check,
        onMismatch,
      ),
    );
    // Regardless of how the parent fared: a counter-signature is over its signature value, not its content.
    results.push(...(await counterSignaturesOf(signed, index, signatureName, results.length - 1)));
  }
  return results;
}

/**
 * Counter-signatures in a CMS: `SignerInfo`s over the parent's signature value, held
 * in its unsigned attributes.
 *
 * Verified by hand because the library's own check demands a content-type attribute,
 * which a counter-signature is required not to have. `counters` is relative to what
 * this CMS produced, and the caller makes it absolute.
 */
async function counterSignaturesOf(signed: SignedData, index: number, source: string, parent: number): Promise<ContainerSignature[]> {
  if (!signed.signerInfos[index]) return [];
  const value = new Uint8Array(signed.signerInfos[index].signature.valueBlock.valueHexView);
  const certificates = certificatesOf(signed);
  const results: ContainerSignature[] = [];

  for (const attribute of signed.signerInfos[index].unsignedAttrs?.attributes ?? []) {
    if (attribute.type !== COUNTER_SIGNATURE) continue;
    for (const raw of attribute.values) {
      const blank = { ...blankSignature(source, 'CAdES'), counters: parent, certificateCount: certificates.length };

      let counter: SignerInfo;
      try {
        counter = new SignerInfo({ schema: raw });
      } catch {
        results.push({ ...blank, verdict: 'unreadable', detail: 'This counter-signature could not be read.' });
        continue;
      }

      const certificate = await certificateForSid(counter.sid, certificates);
      if (!certificate) {
        results.push({ ...blank, verdict: 'broken', detail: 'It does not carry the certificate it says it was made with.' });
        continue;
      }
      const hash = hashForOid(counter.digestAlgorithm.algorithmId);
      if (!hash) {
        results.push({ ...blank, verdict: 'cannot-check', detail: 'It uses a digest this browser cannot compute.' });
        continue;
      }

      try {
        const attributes = counter.signedAttrs?.attributes ?? [];
        const stated = attributes.find((candidate) => candidate.type === MESSAGE_DIGEST)?.values[0] as { valueBlock: { valueHexView: Uint8Array } } | undefined;
        if (counter.signedAttrs && !stated) {
          results.push({ ...blank, verdict: 'broken', detail: 'It does not state what it signed.' });
          continue;
        }

        const signedBytes = counter.signedAttrs ? new Uint8Array(counter.signedAttrs.encodedValue) : value;
        const holds = await signatureValueHolds(counter, signedBytes, certificate, hash);
        // The value first, as everywhere: until it holds, the digest beside it is text.
        if (!holds) {
          results.push({ ...blank, verdict: 'broken', detail: 'It does not check out against the certificate it names.' });
          continue;
        }
        if (stated && !sameBytes(await digest(hash, value), new Uint8Array(stated.valueBlock.valueHexView))) {
          results.push({ ...blank, verdict: 'altered', counterChanged: true });
          continue;
        }

        const binding = await bindingIn(counter, certificate);
        if (binding !== 'bound') {
          results.push({
            ...blank,
            verdict: binding === 'unbound' ? 'broken' : 'cannot-check',
            detail: binding === 'unbound' ? 'The certificate it carries is not the one its signed details name.' : 'Nothing it signed says whose certificate this is, so it names nobody.',
          });
          continue;
        }

        const time = attributes.find((candidate) => candidate.type === SIGNING_TIME)?.values[0] as { toDate?: () => Date } | undefined;
        results.push({
          ...blank,
          ...(await factsFor(certificate, certificates, certificates.length)),
          verdict: 'intact',
          time: time?.toDate?.() ?? null,
          unchecked: (counter.unsignedAttrs?.attributes ?? []).some((candidate) => candidate.type === COUNTER_SIGNATURE) ? ['counter-signature'] : [],
        });
      } catch {
        results.push({ ...blank, verdict: 'cannot-check', detail: 'It uses something this browser cannot check.' });
      }
    }
  }
  return results;
}

function finish(
  described: Omit<ContainerSignature, 'verdict'>,
  listed: ListedFiles,
  check: Awaited<ReturnType<typeof checkSigner>>,
  onMismatch: Partial<ContainerSignature>,
): ContainerSignature {
  // Until it holds, the name and the time beside it are only what the file says.
  const carried = { ...blankSignature(described.source, described.form), certificateCount: described.certificateCount };

  switch (check) {
    case 'bad-signature':
      return { ...carried, verdict: 'broken', detail: 'It does not check out against the certificate it carries.' };
    case 'digest-mismatch':
      return { ...carried, ...onMismatch, verdict: 'altered' };
    case 'no-certificate':
      return { ...carried, verdict: 'broken', detail: 'It does not carry the certificate it says it was made with.' };
    case 'cannot-check':
      return { ...carried, verdict: 'cannot-check', detail: 'It uses something this browser cannot check.' };
    case 'holds':
      break;
  }

  const report = { ...described, covers: listed.covers, changed: listed.changed, missing: listed.missing };
  if (listed.changed.length > 0 || listed.missing.length > 0) return { ...report, verdict: 'altered' };
  if (listed.cannotCheck) return { ...report, verdict: 'cannot-check', detail: listed.cannotCheck };
  if (listed.covers.length === 0) return { ...report, verdict: 'covers-nothing' };
  return { ...report, verdict: 'intact' };
}
