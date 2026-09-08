/** The six working screens, plus the landing page. */
export type View = 'home' | 'notarize' | 'attest' | 'verify' | 'library' | 'help' | 'qanda';

/**
 * Route ids are deliberately unchanged from the previous interface even where
 * the labels moved on: `#/notarize` and `#/attest` are in people's bookmarks
 * and in the installed PWA's start URL.
 */
export const NAV: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'notarize', label: 'Timestamp' },
  { id: 'attest', label: 'Signatures' },
  { id: 'verify', label: 'Verify' },
  { id: 'library', label: 'My certificates' },
  { id: 'help', label: 'How it works' },
  { id: 'qanda', label: 'Q&A' },
];

export const ROUTES: readonly View[] = ['home', ...NAV.map((n) => n.id)];
