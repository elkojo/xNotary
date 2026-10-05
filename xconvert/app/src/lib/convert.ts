/**
 * One conversion, from a document and its companion files to the chosen format.
 *
 * Pure orchestration over the two engines, so it runs the same in the Web Worker and in
 * tests. PDF is the one format pandoc does not write in a browser: pandoc writes Typst
 * markup and extracts the images, and our Typst wrapper typesets that into PDF/A-2b.
 */
import type { Pandoc } from './pandoc';
import UNDRAWABLE_FILTER from './undrawable.lua?raw';
import type { TypstPdf } from './typst-pdf';

export type Paper = 'a4' | 'letter';

export interface ConvertRequest {
  readonly input: { readonly name: string; readonly bytes: Uint8Array; readonly format: string };
  /** Files the document refers to by name — the images beside a Markdown file, say. */
  readonly resources: ReadonlyArray<{ readonly name: string; readonly bytes: Uint8Array }>;
  /** pandoc's output format, or `pdf`. */
  readonly to: string;
  readonly paper: Paper;
  /** Used only where the document does not say its own language (BCP 47, e.g. `cs-CZ`). */
  readonly fallbackLang: string;
  /** PDF/A requires a creation date; the wrapper reads no clock, so it is passed in. */
  readonly now: Date;
}

export interface ConvertResult {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mime: string;
  /** pandoc's warnings, worded by pandoc. */
  readonly warnings: readonly string[];
}

export class ConversionError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
    this.name = 'ConversionError';
  }
}

const EXTENSIONS: Record<string, string> = {
  pdf: 'pdf', docx: 'docx', odt: 'odt', html: 'html', html4: 'html', html5: 'html',
  markdown: 'md', gfm: 'md', commonmark: 'md', commonmark_x: 'md', markdown_strict: 'md',
  markdown_mmd: 'md', markdown_phpextra: 'md', epub: 'epub', epub2: 'epub', epub3: 'epub',
  plain: 'txt', latex: 'tex', beamer: 'tex', context: 'tex', rtf: 'rtf', pptx: 'pptx',
  typst: 'typ', rst: 'rst', org: 'org', asciidoc: 'adoc', asciidoctor: 'adoc', docbook: 'xml',
  docbook4: 'xml', docbook5: 'xml', jats: 'xml', tei: 'xml', opendocument: 'xml', icml: 'icml',
  json: 'json', native: 'hs', mediawiki: 'wiki', dokuwiki: 'txt', textile: 'textile',
  revealjs: 'html', slidy: 'html', s5: 'html', dzslides: 'html', slideous: 'html',
  man: 'man', ms: 'ms', texinfo: 'texi', fb2: 'fb2', ipynb: 'ipynb', djot: 'dj',
};

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  epub: 'application/epub+zip',
  html: 'text/html;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  rtf: 'application/rtf',
  json: 'application/json',
  xml: 'application/xml',
};

/**
 * Formats whose output is only a valid file with pandoc's template around it. The rest are
 * written as a fragment: a standalone Markdown file would open with a metadata block the
 * reader never wrote.
 */
const STANDALONE = new Set([
  'html', 'html4', 'html5', 'latex', 'beamer', 'context', 'typst', 'rtf', 'revealjs', 'slidy',
  's5', 'dzslides', 'slideous', 'docbook', 'docbook4', 'docbook5', 'jats', 'tei', 'texinfo',
  'ms', 'man', 'opendocument', 'icml', 'fb2',
]);

export const extensionFor = (format: string) => EXTENSIONS[format] ?? format;

/** `Smlouva.docx` → `Smlouva.pdf`; a name with no extension keeps all of it. */
export function outputName(inputName: string, format: string): string {
  const dot = inputName.lastIndexOf('.');
  const base = dot > 0 ? inputName.slice(0, dot) : inputName;
  return `${base}.${extensionFor(format)}`;
}

/** Letter where it is the norm, A4 everywhere else. From a locale such as `en-US`. */
export function defaultPaper(locale: string): Paper {
  const region = new Intl.Locale(locale).maximize().region ?? '';
  return ['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'GT', 'SV', 'NI', 'CR', 'PA', 'DO', 'PR'].includes(region)
    ? 'letter'
    : 'a4';
}

/** Typst's own names for the sizes: it knows Letter only as `us-letter`, and rejects `letter`. */
const TYPST_PAPER: Record<Paper, string> = { a4: 'a4', letter: 'us-letter' };

const DEFAULTS_FILE = 'xconvert-defaults.yaml';
const UNDRAWABLE_FILE = 'xconvert-undrawable.lua';
const OUTPUT_FILE = 'output';

export async function convert(
  request: ConvertRequest,
  pandoc: Pandoc,
  typst: () => Promise<TypstPdf>,
): Promise<ConvertResult> {
  const { input, to } = request;
  const toPdf = to === 'pdf';
  const writer = toPdf ? 'typst' : to;

  // The language goes in as a metadata *file*: pandoc lets the document's own metadata
  // override a metadata file, so a document that says it is English stays English.
  const files: Record<string, Uint8Array> = {
    [input.name]: input.bytes,
    [DEFAULTS_FILE]: new TextEncoder().encode(`lang: ${JSON.stringify(request.fallbackLang)}\n`),
  };
  for (const resource of request.resources) files[resource.name] = resource.bytes;
  if (toPdf) files[UNDRAWABLE_FILE] = new TextEncoder().encode(UNDRAWABLE_FILTER);

  const result = pandoc.convert(
    {
      from: input.format,
      to: writer,
      'input-files': [input.name],
      'output-file': OUTPUT_FILE,
      'metadata-files': [DEFAULTS_FILE],
      standalone: toPdf || STANDALONE.has(writer),
      // For PDF: images Typst cannot draw become a visible note (undrawable.lua).
      ...(toPdf ? { 'extract-media': 'media', variables: { papersize: TYPST_PAPER[request.paper] }, filters: [UNDRAWABLE_FILE] } : {}),
    },
    files,
  );

  // A warning from our own filter is shown as its message alone: where in our Lua it was
  // raised is no business of the reader's.
  const warnings = result.warnings
    .filter((w) => w.verbosity !== 'INFO')
    .map((w) => (w.type === 'ScriptingWarning' && w.message ? w.message : w.pretty));
  if (!result.output) {
    throw new ConversionError('pandoc could not convert this document.', result.stderr.trim() || 'No output, and no reason given.');
  }

  if (!toPdf) {
    const extension = extensionFor(to);
    return { bytes: result.output, fileName: outputName(input.name, to), mime: MIME[extension] ?? 'application/octet-stream', warnings };
  }

  const source = new TextDecoder().decode(result.output);
  const media = new Map([...result.media].map(([path, bytes]) => [`/${path}`, bytes]));
  const typeset = (await typst()).compile(source, media, 'pdf-a-2b', request.now);
  if (!typeset.ok) {
    throw new ConversionError('The document could not be typeset as PDF.', typeset.diagnostics);
  }
  return { bytes: typeset.pdf, fileName: outputName(input.name, 'pdf'), mime: MIME.pdf, warnings };
}
