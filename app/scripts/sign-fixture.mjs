/**
 * Signs a small PDF with a PKCS#12 credential, producing the PAdES fixture used
 * by the M0 spike. Dev-only; @signpdf is not a runtime dependency of the app.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';

const [p12Path, outPath] = process.argv.slice(2);

const pdf = await PDFDocument.create();
const page = pdf.addPage([595, 300]);
const font = await pdf.embedFont(StandardFonts.Helvetica);
page.drawText('xNotary M0 spike — PAdES fixture', { x: 40, y: 240, size: 16, font });
page.drawText('Stands in for a Certificate 1 PDF signed by a signer', {
  x: 40,
  y: 210,
  size: 10,
  font,
});
page.drawText('with a qualified certificate from a Czech QTSP.', { x: 40, y: 195, size: 10, font });

pdflibAddPlaceholder({
  pdfDoc: pdf,
  reason: 'I attest to Certificate 1',
  contactInfo: 'jan.novak@example.cz',
  name: 'Jan Novak',
  location: 'Praha, CZ',
  signatureLength: 8192,
});

const withPlaceholder = Buffer.from(await pdf.save({ useObjectStreams: false }));
const signer = new P12Signer(readFileSync(p12Path), { passphrase: 'xnotary' });
const signed = await new SignPdf().sign(withPlaceholder, signer);

writeFileSync(outPath, signed);
console.log(`signed ${signed.length} bytes -> ${outPath}`);
