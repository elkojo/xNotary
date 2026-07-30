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

/** Local time with its zone named, for the screen. */
export function localStamp(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZoneName: 'short',
  });
}
