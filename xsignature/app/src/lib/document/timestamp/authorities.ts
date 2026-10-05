/**
 * Where a timestamp can actually be fetched from, in a browser.
 *
 * This list is much shorter than it looks like it should be, and the reason is
 * worth writing down because it will come up again.
 *
 * A timestamp request is a POST with the content type
 * `application/timestamp-query`, which is not one of the three types a browser
 * will send without asking permission first. So every request is preceded by a
 * CORS preflight, and an authority that does not answer that preflight cannot
 * be reached from a web page at all — no matter that the same request works
 * perfectly from a command line.
 *
 * Of the well-known authorities, none answer it. DigiCert and SSL.com are not
 * even served over TLS, so a page served over HTTPS cannot reach them on those
 * grounds alone. Sectigo, FreeTSA and the rest answer the request itself but
 * send no `Access-Control-Allow-Origin`, so the browser discards the reply
 * before this code ever sees it.
 *
 * What remains are relays that do set the header. That is a real cost and it is
 * stated plainly in the interface rather than hidden here: the request goes to
 * the relay, not to the authority whose name is on the token. What the relay
 * can see is a 32-byte digest, the time, and the address it came from. It
 * cannot see the document, and the digest cannot be turned back into one.
 *
 * "Qualified" in a note is a fact checked, not a name read. On 2026-10-05 a
 * token from each of the last three entries was matched, by key, against a
 * granted TSA/QTST service on its country's EU trust list. The first four
 * failed the same check: the relay reaches Sectigo's public UK signer, not its
 * qualified Spanish one, and GlobalSign's AATL signer, not its qualified one.
 * Sectigo's qualified service, and every other qualified authority tried
 * (Docusign France, Evrotrust, ACCV, Ministero della Difesa, SK ID Solutions
 * for RIA), answers no preflight and is absent from the relay. Re-check
 * before adding to this list: a relay path can change without notice.
 */

export interface Authority {
  readonly id: string;
  readonly name: string;
  /** Who signs the token that comes back. */
  readonly signedBy: string;
  readonly url: string;
  /**
   * Whether the signing certificate chains to a root Adobe Acrobat trusts by
   * default: one on the Adobe Approved Trust List, or a qualified service on
   * the EU trust lists, which Acrobat also loads unless told not to. Checked
   * against the lists themselves, not against what a relay says about them —
   * the ai.moda relay marks Izenpe as on the AATL, and it is not.
   *
   * It decides what the reader is told to expect when they open the result: a
   * timestamp Acrobat validates, or one it reports as being of unknown origin
   * while the bytes remain perfectly checkable by other tools.
   */
  readonly adobeTrusted: boolean;
  readonly note: string;
}

export const AUTHORITIES: readonly Authority[] = [
  {
    id: 'izenpe',
    name: 'Izenpe (Spain)',
    signedBy: 'Izenpe',
    url: 'https://rfc3161.ai.moda/izenpe',
    adobeTrusted: true,
    note: 'A qualified electronic timestamp under eIDAS, issued by Izenpe, the Basque Government’s certification authority. Reached through the ai.moda relay. Acrobat recognises the signer through the EU trust list.',
  },
  {
    id: 'cartao-de-cidadao',
    name: 'Cartão de Cidadão (Portugal)',
    signedBy: 'Cartão de Cidadão',
    url: 'https://rfc3161.ai.moda/instituto-dos-registos-e-do-notariado-i.p.',
    adobeTrusted: true,
    note: 'A qualified electronic timestamp under eIDAS, issued by the Instituto dos Registos e do Notariado. Fair use: at most 20 requests in 20 minutes. Reached through the ai.moda relay. Acrobat recognises the signer through the EU trust list.',
  },
  {
    id: 'aped',
    name: 'APED (Greece)',
    signedBy: 'APED',
    url: 'https://rfc3161.ai.moda/aped',
    adobeTrusted: true,
    note: 'A qualified electronic timestamp under eIDAS, issued by the Hellenic Public Administration Certification Authority. Reached through the ai.moda relay. Acrobat recognises the signer through the EU trust list.',
  },
  {
    id: 'digicert',
    name: 'DigiCert',
    signedBy: 'DigiCert',
    url: 'https://rfc3161.ai.moda/digicert',
    adobeTrusted: true,
    note: 'Reached through the ai.moda relay. Acrobat recognises the signer.',
  },
  {
    id: 'sectigo',
    name: 'Sectigo',
    signedBy: 'Sectigo',
    url: 'https://rfc3161.ai.moda/sectigo',
    adobeTrusted: true,
    note: 'Reached through the ai.moda relay. Acrobat recognises the signer.',
  },
  {
    id: 'globalsign',
    name: 'GlobalSign',
    signedBy: 'GlobalSign',
    url: 'https://rfc3161.ai.moda/globalsign',
    adobeTrusted: true,
    note: 'Reached through the ai.moda relay. Acrobat recognises the signer.',
  },
  {
    id: 'sigstore',
    name: 'Sigstore',
    signedBy: 'sigstore.dev',
    url: 'https://timestamp.sigstore.dev/api/v1/timestamp',
    adobeTrusted: false,
    note: 'Reached directly, with no relay in between. Its root is its own, so Acrobat will not recognise the signer — the token is still verifiable with Sigstore’s published certificate.',
  },
];

export const DEFAULT_AUTHORITY_ID = 'izenpe';

export function authorityById(id: string): Authority | undefined {
  return AUTHORITIES.find((authority) => authority.id === id);
}

/**
 * Accept a timestamp authority URL typed by hand, or reject it.
 *
 * Only HTTPS. A timestamp fetched over plain HTTP can be swapped in transit by
 * anyone on the path, which turns the one thing the token is supposed to
 * establish into the one thing it cannot. The browser would refuse the request
 * from an HTTPS page anyway; refusing it here means saying why.
 */
export function checkAuthorityUrl(input: string): { url: string } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: 'Enter the address of a timestamp authority.' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: 'That is not a web address.' };
  }

  if (parsed.protocol === 'http:') {
    return {
      error:
        'Only https addresses work. Over plain http the reply can be changed on the way back, which defeats the point of a timestamp.',
    };
  }
  if (parsed.protocol !== 'https:') return { error: 'Only https addresses work.' };

  return { url: parsed.toString() };
}
