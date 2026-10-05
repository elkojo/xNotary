/** Routing. One working screen; the table is what the shared bar reads. */
export type View = 'convert' | 'licences';

export const NAV: ReadonlyArray<{ id: View; label: string; title: string }> = [
  { id: 'convert', label: 'Convert', title: 'xConvert — Convert a document' },
];

/** Reached from the footer, not the bar: a page of record, not a task. */
const UNLISTED: ReadonlyArray<{ id: View; title: string }> = [{ id: 'licences', title: 'xConvert — Licences and source' }];

export const ROUTES: readonly View[] = [...NAV, ...UNLISTED].map((item) => item.id);

export const titleFor = (view: View) => [...NAV, ...UNLISTED].find((item) => item.id === view)?.title ?? NAV[0].title;
