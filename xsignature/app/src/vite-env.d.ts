/// <reference types="vite/client" />

/** The app's version, substituted at build time from package.json. */
declare const __APP_VERSION__: string;

/** Which build this is; /version.json names the one the site serves now (src/site/update-check.ts). */
declare const __BUILD_ID__: string;

/** The Lightning QR for the support dialog, an SVG drawn at build time (app/scripts/lightning-qr.ts). */
declare const __LIGHTNING_QR__: string;
