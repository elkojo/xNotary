import { ConversionError, convert, defaultPaper, outputName, type ConvertRequest } from './convert';
import type { Pandoc, PandocResult } from './pandoc';
import type { TypstPdf, TypstResult } from './typst-pdf';

/** A pandoc that records what it was asked and answers with what the test says. */
function fakePandoc(answer: Partial<PandocResult>) {
  const calls: Array<{ options: Record<string, unknown>; files: Record<string, Uint8Array> }> = [];
  const pandoc: Pandoc = {
    convert(options, files) {
      calls.push({ options, files });
      return { stdout: new Uint8Array(), stderr: '', warnings: [], output: null, media: new Map(), ...answer };
    },
    query: () => [],
  };
  return { pandoc, calls };
}

function fakeTypst(result: TypstResult) {
  const calls: Array<{ source: string; files: ReadonlyMap<string, Uint8Array>; standard: string }> = [];
  const typst: TypstPdf = {
    faces: 7,
    compile(source, files, standard) {
      calls.push({ source, files, standard });
      return result;
    },
  };
  return { typst: async () => typst, calls };
}

const bytes = (text: string) => new TextEncoder().encode(text);
const request = (over: Partial<ConvertRequest> = {}): ConvertRequest => ({
  input: { name: 'Smlouva o dílo.docx', bytes: bytes('DOCX'), format: 'docx' },
  resources: [],
  to: 'odt',
  paper: 'a4',
  fallbackLang: 'cs-CZ',
  now: new Date('2026-10-05T10:00:00Z'),
  ...over,
});
const unused = fakeTypst({ ok: false, diagnostics: 'not called' }).typst;

describe('convert', () => {
  it('names the result after the document', async () => {
    const { pandoc } = fakePandoc({ output: bytes('ODT') });
    const result = await convert(request(), pandoc, unused);
    expect(result.fileName).toBe('Smlouva o dílo.odt');
    expect(result.mime).toBe('application/vnd.oasis.opendocument.text');
  });

  it('gives the fallback language as a metadata file, which the document may override', async () => {
    const { pandoc, calls } = fakePandoc({ output: bytes('ODT') });
    await convert(request(), pandoc, unused);
    const { options, files } = calls[0];
    expect(options['metadata-files']).toEqual(['xconvert-defaults.yaml']);
    expect(new TextDecoder().decode(files['xconvert-defaults.yaml'])).toBe('lang: "cs-CZ"\n');
    // Not --metadata, which would override the document's own language.
    expect(options).not.toHaveProperty('metadata');
  });

  it('hands companion files to pandoc under their own names', async () => {
    const { pandoc, calls } = fakePandoc({ output: bytes('DOCX') });
    await convert(
      request({ input: { name: 'notes.md', bytes: bytes('![](diagram.png)'), format: 'markdown' }, to: 'docx', resources: [{ name: 'diagram.png', bytes: bytes('PNG') }] }),
      pandoc,
      unused,
    );
    expect(Object.keys(calls[0].files)).toContain('diagram.png');
    expect(calls[0].options['input-files']).toEqual(['notes.md']);
  });

  it('keeps every image for formats other than PDF', async () => {
    const { pandoc, calls } = fakePandoc({ output: bytes('ODT') });
    await convert(request({ to: 'odt' }), pandoc, unused);
    expect(calls[0].options).not.toHaveProperty('filters');
  });

  it('writes Markdown as a fragment, HTML as a whole page', async () => {
    const { pandoc, calls } = fakePandoc({ output: bytes('x') });
    await convert(request({ to: 'markdown' }), pandoc, unused);
    await convert(request({ to: 'html' }), pandoc, unused);
    expect(calls.map((c) => c.options.standalone)).toEqual([false, true]);
  });

  it('keeps only warnings, not pandoc’s notes', async () => {
    const { pandoc } = fakePandoc({
      output: bytes('x'),
      warnings: [
        { type: 'Extracting', verbosity: 'INFO', pretty: 'Extracting media/image1.png...' },
        { type: 'CouldNotFetchResource', verbosity: 'WARNING', pretty: 'Could not fetch resource diagram.png' },
      ],
    });
    const result = await convert(request(), pandoc, unused);
    expect(result.warnings).toEqual(['Could not fetch resource diagram.png']);
  });

  it('shows a warning from our own filter without pandoc’s preamble', async () => {
    const { pandoc } = fakePandoc({
      output: bytes('x'),
      warnings: [
        {
          type: 'ScriptingWarning',
          verbosity: 'WARNING',
          pretty: 'Scripting warning at xconvert-undrawable.lua line 14 column 1: Image not shown in the PDF: a.wmf',
          message: 'Image not shown in the PDF: a.wmf',
        },
      ],
    });
    expect((await convert(request(), pandoc, unused)).warnings).toEqual(['Image not shown in the PDF: a.wmf']);
  });

  it('says why when pandoc writes nothing', async () => {
    const { pandoc } = fakePandoc({ stderr: 'Unknown input format foo\n' });
    const failure = await convert(request(), pandoc, unused).catch((e) => e);
    expect(failure).toBeInstanceOf(ConversionError);
    expect(failure.detail).toBe('Unknown input format foo');
  });

  describe('to PDF', () => {
    const pdf = bytes('%PDF-1.7');

    it('asks pandoc for Typst, its images and the paper size, then typesets PDF/A-2b', async () => {
      const { pandoc, calls } = fakePandoc({ output: bytes('= Smlouva'), media: new Map([['media/media/image1.png', bytes('PNG')]]) });
      const typst = fakeTypst({ ok: true, pdf });
      const result = await convert(request({ to: 'pdf', paper: 'letter' }), pandoc, typst.typst);

      expect(calls[0].options).toMatchObject({ to: 'typst', standalone: true, 'extract-media': 'media', variables: { papersize: 'us-letter' } });
      // Images Typst cannot draw are replaced by a note before they can stop the PDF.
      expect(calls[0].options.filters).toEqual(['xconvert-undrawable.lua']);
      expect(new TextDecoder().decode(calls[0].files['xconvert-undrawable.lua'])).toContain('function Image');
      expect(typst.calls[0].source).toBe('= Smlouva');
      expect([...typst.calls[0].files.keys()]).toEqual(['/media/media/image1.png']);
      expect(typst.calls[0].standard).toBe('pdf-a-2b');
      expect(result).toMatchObject({ bytes: pdf, fileName: 'Smlouva o dílo.pdf', mime: 'application/pdf' });
    });

    it('reports Typst’s own diagnostics when typesetting fails', async () => {
      const { pandoc } = fakePandoc({ output: bytes('#image("/media/a.emf")') });
      const typst = fakeTypst({ ok: false, diagnostics: 'Error (line 1): unknown image format' });
      const failure = await convert(request({ to: 'pdf' }), pandoc, typst.typst).catch((e) => e);
      expect(failure).toBeInstanceOf(ConversionError);
      expect(failure.detail).toContain('unknown image format');
    });

    it('does not load Typst for other formats', async () => {
      const { pandoc } = fakePandoc({ output: bytes('x') });
      let loaded = false;
      await convert(request({ to: 'docx' }), pandoc, async () => {
        loaded = true;
        throw new Error('should not load');
      });
      expect(loaded).toBe(false);
    });
  });
});

describe('outputName', () => {
  it('replaces the last extension only', () => {
    expect(outputName('report.v2.docx', 'pdf')).toBe('report.v2.pdf');
  });
  it('adds one to a name that had none', () => {
    expect(outputName('README', 'html')).toBe('README.html');
  });
  it('keeps a leading-dot name whole', () => {
    expect(outputName('.notes', 'markdown')).toBe('.notes.md');
  });
});

describe('defaultPaper', () => {
  it('is Letter in the United States and Canada', () => {
    expect(defaultPaper('en-US')).toBe('letter');
    expect(defaultPaper('fr-CA')).toBe('letter');
  });
  it('is A4 elsewhere', () => {
    expect(defaultPaper('cs-CZ')).toBe('a4');
    expect(defaultPaper('en-GB')).toBe('a4');
    expect(defaultPaper('de')).toBe('a4');
  });
});
