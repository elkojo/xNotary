/**
 * The formats the screen offers up front. pandoc reads and writes many more; those come
 * from pandoc itself, behind "Show all formats", once it is loaded.
 *
 * `id` is pandoc's own name for the format, except `pdf`, which pandoc does not write in a
 * browser: xConvert writes Typst markup with pandoc and typesets it with ../typst-pdf.
 */
export interface Format {
  readonly id: string;
  readonly label: string;
  readonly extensions: readonly string[];
}

export const COMMON_INPUTS: readonly Format[] = [
  { id: 'docx', label: 'Word (DOCX)', extensions: ['docx'] },
  { id: 'odt', label: 'OpenDocument (ODT)', extensions: ['odt'] },
  { id: 'rtf', label: 'Rich Text (RTF)', extensions: ['rtf'] },
  { id: 'html', label: 'HTML', extensions: ['html', 'htm', 'xhtml'] },
  { id: 'markdown', label: 'Markdown', extensions: ['md', 'markdown'] },
  { id: 'epub', label: 'EPUB', extensions: ['epub'] },
  { id: 'latex', label: 'LaTeX', extensions: ['tex', 'latex'] },
];

export const COMMON_OUTPUTS: readonly Format[] = [
  { id: 'pdf', label: 'PDF/A (archival)', extensions: ['pdf'] },
  { id: 'docx', label: 'Word (DOCX)', extensions: ['docx'] },
  { id: 'odt', label: 'OpenDocument (ODT)', extensions: ['odt'] },
  { id: 'html', label: 'HTML', extensions: ['html'] },
  { id: 'markdown', label: 'Markdown', extensions: ['md'] },
  { id: 'epub', label: 'EPUB', extensions: ['epub'] },
  { id: 'plain', label: 'Plain text', extensions: ['txt'] },
];

/**
 * What a file can be read as, judged by its name.
 *
 * Plain text is deliberately not recognised: pandoc has no plain-text reader, and reading a
 * .txt as Markdown would quietly turn every `*` and `#` in it into formatting.
 */
export function detectInput(fileName: string): Format | null {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return null;
  const extension = fileName.slice(dot + 1).toLowerCase();
  return COMMON_INPUTS.find((format) => format.extensions.includes(extension)) ?? null;
}
