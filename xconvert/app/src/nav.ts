/** Routing. One screen for now; the table is what the shared bar reads. */
export type View = 'convert';

export const NAV: ReadonlyArray<{ id: View; label: string; title: string }> = [
  { id: 'convert', label: 'Convert', title: 'xConvert — Convert a document' },
];

export const ROUTES: readonly View[] = NAV.map((item) => item.id);
