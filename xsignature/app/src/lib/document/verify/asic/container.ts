/**
 * Checking a signature container: a ZIP holding files and the signatures over
 * them (ASiC-E and ASiC-S, ETSI EN 319 162-1, and the national profiles built on
 * them).
 *
 * The limits are those of the PDF check and for the same reasons. This can say a
 * signature verifies and that the files are the ones it signed. It cannot say the
 * signer is who the certificate names, which takes a trust list, so nothing here
 * reports "valid".
 *
 * One limit is the container's own. Signatures in a container are separate files
 * that do not sign each other, so taking one out leaves no trace. This reports the
 * signatures that are here, never that they are all there ever were.
 *
 * What it is reads from its content, not from its name. Real containers arrive
 * called `.zip`.
 */
import { readTimestampToken, timestampTokenFrom } from '../signer';
import { checkDetached, checkManifest, readListedFiles, signatureNamedIn } from './cades';
import {
  blankSignature,
  type CheckedContainer,
  type ContainerArchive,
  type ContainerSignature,
  type ParseXml,
} from './types';
import { childrenNamed, DS, parseInBrowser, parseXmlBytes } from './xml';
import { checkXades, counterSignatureElements } from './xades';
import { ContainerRefused, readZip, type ZipEntry } from './zip';

const ASIC_E = 'application/vnd.etsi.asic-e+zip';
const ASIC_S = 'application/vnd.etsi.asic-s+zip';
const CONTAINER_TYPES = new Set([ASIC_E, ASIC_S, 'application/vnd.bdoc-1.0']);

const META = 'META-INF/';
/**
 * Clause 4.4.3.2: `*signatures*.xml` "in a path beginning with META-INF/", so in a
 * subfolder too, which is where Lithuania's `.adoc` keeps them. An `ASiCManifest`
 * sits directly in the folder (4.4.4.2).
 */
const SIGNATURES = /^META-INF\/(?:.*\/)?[^/]*signatures[^/]*\.xml$/i;
const MANIFEST = /^META-INF\/ASiCManifest[^/]*\.xml$/i;
const ARCHIVE_MANIFEST = /^META-INF\/ASiCArchiveManifest[^/]*\.xml$/i;
const EVIDENCE = /^META-INF\/(?:ASiCEvidenceRecordManifest[^/]*\.xml|[^/]*evidencerecord[^/]*\.(?:ers|xml))$/i;
/** A CMS signature or token, per clauses 4.3.3.2 and 4.4.4.2. */
const CMS_FILE = /^META-INF\/[^/]*(?:signature[^/]*\.p7s|timestamp[^/]*\.tst)$/i;

export async function checkContainer(zip: Uint8Array, parse: ParseXml = parseInBrowser): Promise<CheckedContainer> {
  return checkEntries(readZip(zip), parse, false);
}

/**
 * A container somebody's file manager unpacked: the same parts, as a folder.
 *
 * Signatures cover the parts, not the ZIP, so they check the same. What is lost is what only
 * the ZIP could show, such as a name listed twice, and the result says it came from a folder.
 */
export async function checkUnpacked(entries: readonly ZipEntry[], parse: ParseXml = parseInBrowser): Promise<CheckedContainer> {
  return checkEntries(entries, parse, true);
}

async function checkEntries(entries: readonly ZipEntry[], parse: ParseXml, fromFolder: boolean): Promise<CheckedContainer> {
  const files = new Map(entries.map((entry) => [entry.name, entry.bytes]));
  const names = [...files.keys()];

  const typeEntry = files.get('mimetype');
  const mediaType = typeEntry ? new TextDecoder().decode(typeEntry).trim() : null;

  const signatureFiles = names.filter((name) => SIGNATURES.test(name));
  const manifestFiles = names.filter((name) => MANIFEST.test(name));
  const archiveManifests = names.filter((name) => ARCHIVE_MANIFEST.test(name));
  const cmsFiles = names.filter((name) => CMS_FILE.test(name));

  if (mediaType?.startsWith('application/vnd.oasis.opendocument')) {
    throw new ContainerRefused('This is an office document rather than a signature container, so it is not read here.');
  }
  if (signatureFiles.length + manifestFiles.length + cmsFiles.length === 0 && !CONTAINER_TYPES.has(mediaType ?? '')) {
    throw new ContainerRefused('No signature this check can read was found here.');
  }

  const dataNames = names.filter((name) => name !== 'mimetype' && !name.startsWith(META));
  const dataFiles = new Set(dataNames);

  const signatures: ContainerSignature[] = [];
  const collect = (found: readonly ContainerSignature[]) => {
    // A counter-signature's parent is relative to the batch it arrived in.
    const offset = signatures.length;
    for (const signature of found) {
      signatures.push(signature.counters === null ? signature : { ...signature, counters: signature.counters + offset });
    }
  };

  // One malformed signature is that signature's problem. The others still get their answer.
  const unreadable = (source: string): ContainerSignature[] => [
    { ...blankSignature(source, /\.tst$/i.test(source) ? 'timestamp' : /\.xml$/i.test(source) ? 'XAdES' : 'CAdES'), verdict: 'unreadable', detail: 'Part of this signature could not be read.' },
  ];
  const guarded = async (source: string, check: () => Promise<ContainerSignature[]>) => {
    try {
      return await check();
    } catch {
      return unreadable(source);
    }
  };

  for (const source of signatureFiles) collect(await guarded(source, () => checkSignatureFile(source, files, dataFiles, parse)));
  for (const source of manifestFiles) collect(await guarded(source, () => checkManifest(source, files, dataFiles, parse)));

  // A CMS file no list points to. In ASiC-S that is the normal shape; in ASiC-E
  // nothing says what it signs, and it is reported rather than passed over.
  const claimed = new Set<string>();
  for (const source of [...manifestFiles, ...archiveManifests]) {
    try {
      const named = signatureNamedIn(parseXmlBytes(files.get(source)!, parse).documentElement);
      // An archive manifest can only claim a token. Naming a signature file must not hide it.
      if (manifestFiles.includes(source) || /\.tst$/i.test(named)) claimed.add(named);
    } catch {
      // An unreadable list claims nothing. It is reported where it is checked.
    }
  }
  // A file manager leaves its own files in a folder. They are still listed, and they do not make
  // the one signed file ambiguous.
  const added = fromFolder ? /^(\.DS_Store|Thumbs\.db|desktop\.ini)$/i : /^$/;
  const rootFiles = dataNames.filter((name) => !name.includes('/') && !added.test(name));
  for (const source of cmsFiles.filter((name) => !claimed.has(name))) {
    collect(
      mediaType === ASIC_E
        ? [
            {
              ...blankSignature(source, /\.tst$/i.test(source) ? 'timestamp' : 'CAdES'),
              verdict: 'cannot-check',
              detail: 'No list of files in this container points to it, so nothing says what it signs.',
            },
          ]
        : await guarded(source, () => checkDetached(source, files, rootFiles)),
    );
  }

  const checkedArchives: Array<ContainerArchive & { readonly lists: readonly string[] }> = [];
  for (const source of archiveManifests) checkedArchives.push(await checkArchive(source, files, signatures, parse));
  const archives: ContainerArchive[] = checkedArchives.map(({ lists: _lists, ...archive }) => {
    // Renewal adds evidence to signature files and changes nothing else, and comes later. So a data
    // file changing or going missing is never explained by it. Whether the renewing authority means
    // anything is for the screen, which can ask a list.
    const explicable =
      archive.missing.length === 0 && archive.changed.every((name) => name.startsWith(META)) && archive.time !== null;
    const renewal = !explicable
      ? undefined
      : checkedArchives.find(
          (other) =>
            other.source !== archive.source &&
            other.standing === 'holds' &&
            other.changed.length === 0 &&
            other.missing.length === 0 &&
            other.time !== null &&
            other.time.getTime() > archive.time!.getTime() &&
            other.lists.includes(archive.source),
        );
    return { ...archive, renewedBy: renewal?.source ?? null };
  });

  return {
    fromFolder,
    mediaType,
    unusualMediaType: mediaType !== null && !CONTAINER_TYPES.has(mediaType),
    files: dataNames.map((name) => ({
      name,
      bytes: files.get(name)!,
      coveredBy: signatures.flatMap((signature, index) =>
        signature.verdict === 'intact' && signature.covers.includes(name) ? [index] : [],
      ),
    })),
    signatures,
    archives,
    uncheckedEvidence: names.some((name) => EVIDENCE.test(name)),
  };
}

/**
 * An `ASiCArchiveManifest`: a timestamp over a list of the container's parts,
 * signature files included, renewing the evidence for all of them.
 *
 * Unlike an archive timestamp inside an XAdES signature, this involves no rendering
 * choices: bytes are bytes, so a mismatch here is a finding.
 */
async function checkArchive(
  source: string,
  files: ReadonlyMap<string, Uint8Array>,
  signatures: readonly ContainerSignature[],
  parse: ParseXml,
): Promise<ContainerArchive & { readonly lists: readonly string[] }> {
  const blank = { source, time: null, signedBy: null, certificate: null, changed: [], missing: [], coversEverySignature: false, renewedBy: null, lists: [] };

  let root: Element;
  try {
    root = parseXmlBytes(files.get(source)!, parse).documentElement;
  } catch {
    return { ...blank, standing: 'unreadable' };
  }

  const token = files.get(signatureNamedIn(root));
  if (!token) return { ...blank, standing: 'unreadable' };

  let stamp;
  try {
    stamp = await readTimestampToken(timestampTokenFrom(token), files.get(source)!);
  } catch {
    return { ...blank, standing: 'unreadable' };
  }
  if (!stamp) return { ...blank, standing: 'unreadable' };

  let listed;
  try {
    listed = await readListedFiles(root, files, new Set(files.keys()));
  } catch {
    return { ...blank, standing: 'unreadable' };
  }
  const signatureFiles = signatures.filter((signature) => signature.form !== 'timestamp').map((signature) => signature.source);
  return {
    source,
    standing: stamp.standing,
    time: stamp.time,
    signedBy: stamp.signedBy,
    certificate: stamp.certificate,
    changed: listed.changed,
    missing: listed.missing,
    coversEverySignature: signatureFiles.every((name) => listed.covers.includes(name)),
    renewedBy: null,
    lists: listed.covers,
  };
}

async function checkSignatureFile(
  source: string,
  files: ReadonlyMap<string, Uint8Array>,
  dataFiles: ReadonlySet<string>,
  parse: ParseXml,
): Promise<ContainerSignature[]> {
  let root: Element;
  try {
    root = parseXmlBytes(files.get(source)!, parse).documentElement;
  } catch {
    return [{ ...blankSignature(source, 'XAdES'), verdict: 'unreadable', detail: 'Its signature file could not be read.' }];
  }

  const elements =
    root.localName === 'Signature' && root.namespaceURI === DS ? [root] : childrenNamed(root, 'Signature', DS);

  const checked: ContainerSignature[] = [];
  const walk = async (element: Element, parent: Element | null, parentIndex: number | null): Promise<void> => {
    let result: ContainerSignature;
    try {
      result = await checkXades(element, source, files, dataFiles, parent);
    } catch {
      result = { ...blankSignature(source, 'XAdES'), verdict: 'unreadable', detail: 'Part of this signature could not be read.' };
    }
    const index = checked.length;
    checked.push({ ...result, counters: parentIndex });
    for (const nested of counterSignatureElements(element)) await walk(nested, element, index);
  };
  for (const element of elements) await walk(element, null, null);
  return checked;
}
