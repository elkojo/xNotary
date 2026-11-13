import QRCode from 'qrcode';

import { LIGHTNING, lightningUri } from '../src/site/support';

/**
 * The Lightning QR, drawn at build time rather than in the browser so no page ships a QR
 * library. /support/ shows it, and so does the dialog every service opens once a task is
 * finished (src/site/SupportLink.svelte) — so every Vite build defines `__LIGHTNING_QR__` from
 * this one function. It lives in app/ so `qrcode` resolves from app/node_modules for the other
 * services' builds too.
 *
 * An LNURL goes in upper case, which QR codes store more compactly (LUD-01); the modules are
 * painted in `currentColor`, so the page's ink colours them and no colour is written outside
 * app.css.
 */
export async function lightningQr(): Promise<string> {
  const svg = await QRCode.toString(/^lnurl/i.test(LIGHTNING) ? LIGHTNING.toUpperCase() : lightningUri(LIGHTNING), {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000ff', light: '#00000000' },
  });
  return svg.replace(/<path fill="#00000000"[^>]*\/>/g, '').replace(/stroke="#000000"/g, 'stroke="currentColor"');
}
