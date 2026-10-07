/**
 * Supporting the project: one page for the whole site, at /support/ (app/hub/Support.svelte).
 *
 * Voluntary, always. Nothing on the site waits for a payment, and the page cannot know whether
 * one was made: it has no server to ask, and asks nobody. Only Lightning works for now; the
 * other methods are shown as under development.
 */

/** Where every service links to it from a finished task. */
export const SUPPORT_HREF = '/support/';

/**
 * The project's Lightning payment code (LNURL-pay, or a Lightning address). The QR on the page
 * is rendered from it at build time (vite.hub.config.ts), in ink, so the page ships no QR code
 * library. A wallet that scans it talks to the service behind it directly; the page sends
 * nothing. `support.test.ts` refuses the placeholder.
 */
export const LIGHTNING = 'lnurl1dp68gurn8ghj7cmpddjjucmpwd5z7tnhv4kxctttdehhwm30d3h82unvwqhk66tvv9hq3pvvk9';

/** What a `lightning:` link or a QR carries: the code itself, upper-cased if it is an LNURL. */
export function lightningUri(code: string): string {
  return /^lnurl/i.test(code) ? `lightning:${code.toUpperCase()}` : `lightning:${code}`;
}
