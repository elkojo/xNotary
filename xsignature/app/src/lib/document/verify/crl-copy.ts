/**
 * Revocation lists kept on this site, and how to find the right one.
 *
 * No page can read an authority's list directly: none of the addresses measured send a CORS
 * header. So a scheduled job collects them (`scripts/crls.ts`) and the site serves the copies.
 *
 * A copy is found by the exact address the signer's certificate names, never by issuer alone. An
 * authority may split revocation across several lists, and a certificate's absence from a list
 * that was never meant to carry it proves nothing.
 *
 * Nothing about a copy is taken from this site on trust. Whoever fetches one verifies it against
 * the issuer's key, so a wrong or planted file can only fail. What the site can do is be behind:
 * a copy older than the signature cannot speak for it, and the screen says so.
 */

/** A copy's file name: the address without its scheme, since the same list is served on both. */
export async function crlFileName(url: string): Promise<string> {
  const bare = url.replace(/^https?:\/\//i, '').replace(/^[^/]+/, (host) => host.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bare));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The first copy this site has of a list the certificate names; `absent` when it has none;
 * `unreachable` when it could not ask, which is worth trying again.
 *
 * A DER list begins with a SEQUENCE. Checking that matters: a static host answers an unknown
 * address with its HTML page and a 200.
 */
export async function fetchCrlCopy(
  base: string,
  urls: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array | 'absent' | 'unreachable'> {
  let failed = false;
  for (const url of urls) {
    try {
      const response = await fetcher(`${base}crls/${await crlFileName(url)}.crl`, { cache: 'no-cache' });
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes[0] === 0x30) return bytes;
    } catch {
      // Offline, perhaps. The next address may fare better.
      failed = true;
    }
  }
  return failed ? 'unreachable' : 'absent';
}
