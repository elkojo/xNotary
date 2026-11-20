/**
 * Injected by `vite.config.ts` — the revision this bundle was built from, so
 * the running app can point at the source it actually corresponds to (AGPL §13).
 */
declare const __APP_REVISION__: string;

/** The site's release, from app/package.json — the same on every service's footer. */
declare const __APP_VERSION__: string;

/** Full commit SHA, or '' when the build had no git checkout to read. */
declare const __APP_COMMIT__: string;
/** The payment QR codes for /support/ and the support dialog, SVGs drawn at build time (app/scripts/support-qr.ts). */
declare const __LIGHTNING_QR__: string;
declare const __BANK_QR__: string;

/** Which build this is; /version.json names the one the site serves now (src/site/update-check.ts). */
declare const __BUILD_ID__: string;
