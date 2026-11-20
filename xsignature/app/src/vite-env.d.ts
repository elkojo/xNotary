/// <reference types="vite/client" />

/** The app's version, substituted at build time from package.json. */
declare const __APP_VERSION__: string;

/** Which build this is; /version.json names the one the site serves now (src/site/update-check.ts). */
declare const __BUILD_ID__: string;

/** The payment QR codes for /support/ and the support dialog, SVGs drawn at build time (app/scripts/support-qr.ts). */
declare const __LIGHTNING_QR__: string;
declare const __BANK_QR__: string;
