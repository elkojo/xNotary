/**
 * Which language the site's own text is shown in. English is the site; other languages are a
 * layer the browser chooses, with no server involved: `?lang=cs`, then the reader's last choice
 * (remembered in this browser only), then — for a reviewed language — the browser's preference.
 *
 * Only some text is ours to translate (docs/i18n.md): the bar, the front page and /situations/,
 * where a wrong word would be a wrong legal claim. The service screens stay English and may be
 * translated by the browser, which is why everything this layer translates is also marked
 * translate="no" with its own lang — so a browser translator leaves it alone.
 *
 * A language ships unreviewed only behind its URL parameter: until a native speaker (a lawyer
 * for the legal parts) has approved it, `reviewed` is false, it is never chosen automatically and
 * the switcher offers it only to someone who arrived with `?lang=`.
 */
export type Lang = 'en' | 'cs';

export const LANGUAGES: Readonly<Record<Lang, { readonly name: string; readonly short: string; readonly reviewed: boolean }>> = {
  en: { name: 'English', short: 'EN', reviewed: true },
  cs: { name: 'Čeština', short: 'CS', reviewed: false },
};

const KEY = 'site.lang';
/** Every language this browser has chosen, so the switcher keeps offering an unreviewed one. */
const CHOSEN_KEY = 'site.lang.chosen';
const isLang = (value: unknown): value is Lang => typeof value === 'string' && value in LANGUAGES;

function stored(): Lang | null {
  try {
    const value = localStorage.getItem(KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

function chosenBefore(): Lang[] {
  try {
    return (localStorage.getItem(CHOSEN_KEY) ?? '').split(',').filter(isLang);
  } catch {
    return [];
  }
}

function remember(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
    localStorage.setItem(CHOSEN_KEY, [...new Set([...chosenBefore(), lang])].join(','));
  } catch {
    // A browser that cannot remember asks again next time; that is all.
  }
}

/** The language a visit starts in. Pure, for the tests: the page passes in what it can see. */
export function initialLang(
  query: string,
  saved: Lang | null,
  preferred: readonly string[],
): { lang: Lang; fromUrl: boolean } {
  const asked = new URLSearchParams(query).get('lang');
  if (isLang(asked)) return { lang: asked, fromUrl: true };
  // A choice once made — by the switcher or by a link with ?lang= — holds on every page.
  if (saved) return { lang: saved, fromUrl: false };
  for (const tag of preferred) {
    const code = tag.slice(0, 2).toLowerCase();
    if (isLang(code) && LANGUAGES[code].reviewed) return { lang: code, fromUrl: false };
  }
  return { lang: 'en', fromUrl: false };
}

const start =
  typeof location === 'undefined'
    ? { lang: 'en' as Lang, fromUrl: false }
    : initialLang(location.search, stored(), typeof navigator === 'undefined' ? [] : navigator.languages ?? []);
if (start.fromUrl) remember(start.lang);

export const site = $state({ lang: start.lang });

/** A language this browser has chosen before, reviewed or not: the switcher keeps offering it. */
const chosen = new Set<Lang>([start.lang, ...chosenBefore()]);

export function setLang(lang: Lang): void {
  site.lang = lang;
  chosen.add(lang);
  remember(lang);
}

/** What the switcher offers: every reviewed language, and the current one even if it is not. */
export function offeredLangs(): Lang[] {
  return (Object.keys(LANGUAGES) as Lang[]).filter((l) => LANGUAGES[l].reviewed || chosen.has(l));
}

/** Pick this language's version of a text, falling back to English. */
export const pick = <T>(texts: { en: T } & Partial<Record<Lang, T>>): T => texts[site.lang] ?? texts.en;
