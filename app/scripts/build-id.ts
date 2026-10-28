import { revision } from './revision';
import { siteVersion } from './site-version';

/**
 * Which build this is, the same in every service's bundle and in /version.json, so an open
 * page can tell that the site has been released again (src/site/update-check.ts).
 *
 * The site is built as four Vite builds in a row; each computes this on its own, so it must
 * be derived, not drawn — `git describe` gives every one of them the same answer. Without git
 * it falls back to the release number, which still changes with every release.
 */
export function buildId(): string {
  const { label } = revision();
  return label === 'unknown' ? siteVersion() : label;
}
