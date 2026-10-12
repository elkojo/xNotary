import { readFileSync } from 'node:fs';

/**
 * The site's release, as every footer states it.
 *
 * One number for every service, because the site is built and deployed as one:
 * a single `v*` tag ships xNotary, xSignature and xConvert together. Read from
 * `app/package.json`, which the release steps already bump — the services' own
 * package versions drifted precisely because nothing bumped them (xSignature
 * said 0.4.0 through four site releases).
 */
export function siteVersion(): string {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
}
