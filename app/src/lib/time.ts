/**
 * How times are written down.
 *
 * Everything a certificate states is in UTC, and says so. A bare
 * `2026-07-30T18:04:00.000Z` is technically unambiguous but reads as machine
 * output, and the "Z" is not something a recipient should have to know: this
 * is a document that goes to clients, courts and counterparties, who will
 * compare it against times in their own zone.
 *
 * The app is the other way round — it shows local time, because that is what
 * someone who just clicked a button expects — but it must name the zone, or
 * two people reading the same certificate in different countries will disagree
 * about when it happened and have no way to tell why.
 */

/** `2026-07-30 18:04:00 UTC` — for anything printed on a certificate. */
export function utcStamp(d: Date): string {
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

/**
 * Local time with its zone named, for the screen.
 *
 * The components are spelled out rather than asked for as `dateStyle` +
 * `timeStyle`. Those two are a shorthand that ECMA-402 forbids combining with
 * any individual component option, `timeZoneName` included — the combination is
 * a TypeError, not a silently ignored option, so it threw on every call. It did
 * so inside the certificate list's render, which left the whole list stuck
 * behind "Loading…" while the records sat in memory. Naming the zone is not
 * optional here (see above), so the components are what has to give.
 */
export function localStamp(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}
