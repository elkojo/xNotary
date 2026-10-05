import { fixture, testTypst } from './binaries.test-helper';

const latin1 = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf);
const now = new Date('2026-10-05T10:00:00Z');

describe('the Typst wrapper', () => {
  it('loads every bundled face', async () => {
    expect((await testTypst()).faces).toBe(7);
  });

  it('writes PDF/A-2b and says so in its metadata', async () => {
    const result = (await testTypst()).compile('= Smlouva\nŘehoř Čížek, Žďár nad Sázavou', new Map(), 'pdf-a-2b', now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = latin1(result.pdf);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('<pdfaid:part>2</pdfaid:part>');
    expect(text).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
    expect(text).toContain('/OutputIntents');
  });

  it('dates the PDF with the date it was given, not a clock of its own', async () => {
    const result = (await testTypst()).compile('Text', new Map(), 'pdf-a-2b', now);
    if (!result.ok) throw new Error(result.diagnostics);
    expect(latin1(result.pdf)).toContain('2026-10-05T10:00:00');
  });

  it('writes a plain PDF without claiming a standard', async () => {
    const result = (await testTypst()).compile('Text', new Map(), 'pdf', now);
    if (!result.ok) throw new Error(result.diagnostics);
    expect(latin1(result.pdf)).not.toContain('pdfaid');
  });

  it('reads images it was handed, at their paths', async () => {
    const png = fixture('diagram.png');
    const result = (await testTypst()).compile('#image("/media/diagram.png")', new Map([['/media/diagram.png', png]]), 'pdf-a-2b', now);
    expect(result.ok).toBe(true);
  });

  it('forgets an earlier call’s files', async () => {
    const typst = await testTypst();
    typst.compile('#image("/a.png")', new Map([['/a.png', fixture('diagram.png')]]), 'pdf', now);
    const result = typst.compile('#image("/a.png")', new Map(), 'pdf', now);
    expect(result.ok).toBe(false);
  });

  it('explains a failure in words, with the line', async () => {
    const result = (await testTypst()).compile('Fine\n#image("/missing.png")', new Map(), 'pdf', now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toMatch(/line 2/);
    expect(result.diagnostics.toLowerCase()).toContain('not found');
  });
});
