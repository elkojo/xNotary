/**
 * Noticing that the site has been released again while a page is open.
 *
 * Every service on the site is built and deployed together, and each build stamps the same
 * build id into its code and into `/version.json` at the site root (vite.hub.config.ts). A
 * page compares the two. When they differ, it offers a refresh — and never refreshes by
 * itself: a document, a key or a drawn signature held only in this page would be lost.
 *
 * The request carries nothing from the reader. It is a same-origin GET of a static file,
 * made with `no-store` so neither the browser nor a worker answers it from a cache.
 */

export const VERSION_URL = '/version.json';

/** How often an open, visible page asks. Focus and reconnecting also ask, throttled. */
export const CHECK_EVERY_MS = 5 * 60 * 1000;
/** No two checks closer than this, whatever triggers them. */
export const MIN_GAP_MS = 60 * 1000;

/** Remembered for this tab only, so a refresh that lands on a stale copy cannot loop. */
const DISMISSED_KEY = 'site.update.dismissed';

/** The build id in a `/version.json` body, or null for anything that is not one. */
export function readBuild(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const build = (body as { build?: unknown }).build;
  return typeof build === 'string' && build.trim() !== '' ? build : null;
}

/**
 * Whether to offer a refresh: the site serves another build than this page is, and the reader
 * has not already set that one aside in this tab — by "Later", or by a refresh that did not
 * bring it (an edge cache still holding the old page while the new version file is out).
 */
export function shouldOffer(served: string | null, running: string, dismissed: string | null): boolean {
  return served !== null && served !== running && served !== dismissed;
}

/** Ask the site which build it serves now. Null on any failure: offline, a deploy half-way, a 404. */
export async function servedBuild(fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchFn(VERSION_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    return readBuild(await response.json());
  } catch {
    return null;
  }
}

/**
 * The footer's version line. A release built from its tag says only the release; any other
 * build adds its id, so a report from it names exactly what it was running.
 */
export function versionLabel(version: string, build: string): string {
  return build === `v${version}` || build === version ? `Version ${version}` : `Version ${version} · ${build}`;
}

// --- What a refresh would lose ------------------------------------------------------------

const holds = new Set<symbol>();
const listeners = new Set<() => void>();

/**
 * Mark this page as holding work a refresh would lose; returns the release. Meant for an
 * `$effect` that returns it, so the hold ends with the condition or the view:
 * `$effect(() => { if (file && !saved) return holdRefresh(); })`.
 */
export function holdRefresh(): () => void {
  const hold = Symbol();
  holds.add(hold);
  listeners.forEach((l) => l());
  return () => {
    holds.delete(hold);
    listeners.forEach((l) => l());
  };
}

export const refreshWouldLoseWork = (): boolean => holds.size > 0;

export function onHoldsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- Per-tab memory ----------------------------------------------------------------------

export function dismissedBuild(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function dismissBuild(build: string): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, build);
  } catch {
    // A tab that cannot remember will ask again; that is all.
  }
}

// --- Watching ----------------------------------------------------------------------------

/**
 * Check now, then every few minutes while the page is visible, and again on focus or when the
 * connection returns — never more often than MIN_GAP_MS. A chunk that fails to load (an old
 * page asking for a file the new release no longer has) counts as news of an update too.
 * Returns the function that stops watching.
 */
export function watchForUpdates(running: string, offer: (served: string) => void, fetchFn: typeof fetch = fetch): () => void {
  let last = 0;
  const check = async () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < MIN_GAP_MS) return;
    last = Date.now();
    const served = await servedBuild(fetchFn);
    if (shouldOffer(served, running, dismissedBuild())) offer(served!);
  };
  const onVisible = () => void check();
  const onChunkFailed = () => {
    last = 0;
    void check();
  };

  void check();
  const timer = setInterval(onVisible, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', onVisible);
  addEventListener('focus', onVisible);
  addEventListener('online', onVisible);
  addEventListener('vite:preloadError', onChunkFailed);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    removeEventListener('focus', onVisible);
    removeEventListener('online', onVisible);
    removeEventListener('vite:preloadError', onChunkFailed);
  };
}
