/** The five working screens, plus the landing page. */
export type View = 'home' | 'notarize' | 'attest' | 'verify' | 'library' | 'help';

/**
 * Route ids are deliberately unchanged from the previous interface even where
 * the labels moved on: `#/notarize` and `#/attest` are in people's bookmarks
 * and in the installed PWA's start URL.
 */
export const NAV: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'notarize', label: 'Timestamp' },
  { id: 'attest', label: 'Certify signers' },
  { id: 'verify', label: 'Verify proof' },
  { id: 'library', label: 'My certificates' },
  { id: 'help', label: 'Help' },
];

/**
 * Retired route ids, and where they lead now. "How it works" and "Q&A" became
 * one Help page; `#/qanda` is still in links people saved.
 */
export const ALIASES: Readonly<Record<string, View>> = { qanda: 'help' };

export const ROUTES: readonly View[] = ['home', ...NAV.map((n) => n.id)];
