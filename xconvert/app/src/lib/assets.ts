/** What the converters are made of, as served from public/vendor/ (see scripts/vendor.sh). */
export const PANDOC_WASM = 'vendor/pandoc.wasm.gz';
export const TYPST_WASM = 'vendor/typst-pdf.wasm.gz';

/** Typst's own default faces, self-hosted: Libertinus for text, DejaVu for code, New CM for maths. */
export const FONT_FILES = [
  'LibertinusSerif-Regular.otf', 'LibertinusSerif-Italic.otf', 'LibertinusSerif-Bold.otf',
  'LibertinusSerif-BoldItalic.otf', 'DejaVuSansMono.ttf', 'DejaVuSansMono-Bold.ttf', 'NewCMMath-Regular.otf',
] as const;
