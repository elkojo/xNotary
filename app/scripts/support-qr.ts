import QRCode from 'qrcode';

import { BANK_SPD, LIGHTNING, lightningUri } from '../src/site/support';

/**
 * The payment QR codes on /support/ and in the dialog every service opens once a task is finished
 * (src/site/SupportCard.svelte), drawn at build time rather than in the browser so no page ships
 * a QR library. Every Vite build defines `__LIGHTNING_QR__` and `__BANK_QR__` from here. It lives
 * in app/ so `qrcode` resolves from app/node_modules for the other services' builds too.
 *
 * The modules are painted in `currentColor`, so the page's ink colours them and no colour is
 * written outside app.css.
 */
async function inkQr(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000ff', light: '#00000000' },
  });
  return svg.replace(/<path fill="#00000000"[^>]*\/>/g, '').replace(/stroke="#000000"/g, 'stroke="currentColor"');
}

/** An LNURL goes in upper case, which QR codes store more compactly (LUD-01). */
export function lightningQr(): Promise<string> {
  return inkQr(/^lnurl/i.test(LIGHTNING) ? LIGHTNING.toUpperCase() : lightningUri(LIGHTNING));
}

/** QR Platba: SPD is upper case by design, so it fits the QR alphanumeric mode. */
export function bankQr(): Promise<string> {
  return inkQr(BANK_SPD);
}
