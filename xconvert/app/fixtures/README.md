# Fixtures for `npm run e2e`

Invented content only. A real document a person sent us is tested freely but never committed:
it carries names and business details, and its comments often carry more.

| File | What it exercises |
|---|---|
| `smlouva.md`, `diagram.png` | Markdown with an image it refers to → DOCX |
| `smlouva.docx` | `smlouva.md` written to DOCX by LibreOffice: DOCX → PDF/A and ODT, both routes |
| `vykres-metafile.docx` | a WMF drawing Typst cannot draw, which becomes a note rather than a failure |
| `poznamka.fodt` → `poznamka.docx` | Keep the layout: a page header pandoc would drop, and a comment PDF/A cannot keep |

`poznamka.docx` is made from its flat-ODT source with desktop LibreOffice; regenerate it with

```bash
soffice --headless --convert-to 'docx:MS Word 2007 XML' poznamka.fodt
```

and check `docProps/core.xml` stays without a creator.
