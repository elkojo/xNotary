/// <reference types="vite/client" />

/** The app's version, substituted at build time from package.json. */
declare const __APP_VERSION__: string;
/** `git describe` of the build, and its full commit hash ('' outside a checkout). */
declare const __APP_REVISION__: string;
declare const __APP_COMMIT__: string;
