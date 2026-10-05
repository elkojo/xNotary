import { COMMON_INPUTS, COMMON_OUTPUTS, detectInput } from './formats';

describe('detectInput', () => {
  it('knows an office document by its extension, whatever its case', () => {
    expect(detectInput('Smlouva o dílo.DOCX')?.id).toBe('docx');
    expect(detectInput('návrh.odt')?.id).toBe('odt');
  });

  it('reads both spellings of Markdown and of HTML', () => {
    expect(detectInput('README.md')?.id).toBe('markdown');
    expect(detectInput('notes.markdown')?.id).toBe('markdown');
    expect(detectInput('page.htm')?.id).toBe('html');
  });

  it('uses the last extension, not the first', () => {
    expect(detectInput('report.final.v2.docx')?.id).toBe('docx');
    expect(detectInput('archive.docx.zip')).toBeNull();
  });

  it('does not guess at plain text', () => {
    // pandoc has no plain-text reader; Markdown would reinterpret the text.
    expect(detectInput('poznámky.txt')).toBeNull();
  });

  it('does not guess at a name with no extension', () => {
    expect(detectInput('Makefile')).toBeNull();
  });
});

describe('the common formats', () => {
  it('offers PDF first, since it is what the other services take', () => {
    expect(COMMON_OUTPUTS[0].id).toBe('pdf');
  });

  it('gives every format a label and at least one extension', () => {
    for (const format of [...COMMON_INPUTS, ...COMMON_OUTPUTS]) {
      expect(format.label.length).toBeGreaterThan(0);
      expect(format.extensions.length).toBeGreaterThan(0);
    }
  });

  it('claims an extension for one input format only', () => {
    const extensions = COMMON_INPUTS.flatMap((format) => format.extensions);
    expect(new Set(extensions).size).toBe(extensions.length);
  });
});
