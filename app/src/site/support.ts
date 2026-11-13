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

/**
 * The project's Czech-crown account, as an IBAN. A payment in another currency is converted by
 * the sender's bank; the code and the page say CZK so nobody is surprised by that.
 */
export const BANK_IBAN = 'CZ0306000000000284531128';

/** What the recipient sees with each transfer, so a gift is told apart from other payments. */
export const BANK_MESSAGE = 'xNotary support';

/**
 * What the bank QR carries: a QR Platba record (SPD 1.0, Czech Banking Association), the format
 * every Czech banking app reads. The account, the currency, the message for the recipient and an
 * instant payment — deliberately no amount (the supporter chooses it) and no due date (it must
 * work on any day; a fixed date is in the past the day after the build). `support.test.ts` pins
 * all of it.
 */
export const BANK_SPD = `SPD*1.0*ACC:${BANK_IBAN}*CC:CZK*MSG:${BANK_MESSAGE}*PT:IP`;

/** ISO 13616: move the country and check digits to the end, letters to numbers, mod 97 is 1. */
export function ibanValid(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

/** `CZ03 0600 0000 0002 8453 1128`: an IBAN as it is printed, in groups of four. */
export function groupIban(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * A Czech IBAN as Czechs write the account: `prefix-number/bank`, leading zeros dropped, the
 * prefix only when there is one. `CZ0306000000000284531128` → `284531128/0600`.
 */
export function czechAccount(iban: string): string {
  const m = /^CZ\d{2}(\d{4})(\d{6})(\d{10})$/.exec(iban);
  if (!m) throw new Error(`Not a Czech IBAN: ${iban}`);
  const [, bank, prefix, number] = m;
  const p = prefix.replace(/^0+/, '');
  return `${p ? `${p}-` : ''}${number.replace(/^0+/, '')}/${bank}`;
}

/** What a `lightning:` link or a QR carries: the code itself, upper-cased if it is an LNURL. */
export function lightningUri(code: string): string {
  return /^lnurl/i.test(code) ? `lightning:${code.toUpperCase()}` : `lightning:${code}`;
}

/** The sessionStorage key that marks the support dialog as already offered in this tab. */
export const OFFERED_KEY = 'xnotary.digital:support-offered';

/** How long after a save the dialog waits, so the browser's own download UI is seen first. */
export const OFFER_DELAY_MS = 1200;

let offeredHere = false;

/**
 * Whether to offer the support dialog now — true once per browser session, then false. Every
 * service shares the origin, so a tab that saved on xNotary is not asked again on xSignature.
 * When storage is refused (some private windows), it falls back to once per page load, which
 * is still never more than once per finished task.
 */
export function claimSupportOffer(storage: Pick<Storage, 'getItem' | 'setItem'> | null = sessionStore()): boolean {
  if (offeredHere) return false;
  offeredHere = true;
  if (!storage) return true;
  try {
    if (storage.getItem(OFFERED_KEY)) return false;
    storage.setItem(OFFERED_KEY, '1');
  } catch {
    // Refused: the page-load flag above is all there is.
  }
  return true;
}

/** For tests only: forget the page-load flag. */
export function resetSupportOfferForTests(): void {
  offeredHere = false;
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}
