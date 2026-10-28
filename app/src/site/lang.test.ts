import { describe, expect, it } from 'vitest';
import { LANGUAGES, initialLang } from './lang.svelte';

describe('initialLang', () => {
  it('is English unless something says otherwise', () => {
    expect(initialLang('', null, ['en-GB'])).toEqual({ lang: 'en', fromUrl: false });
  });

  it('takes ?lang= first, and says it came from the URL', () => {
    expect(initialLang('?lang=cs', 'en', ['en'])).toEqual({ lang: 'cs', fromUrl: true });
  });

  it('ignores a ?lang= it does not know', () => {
    expect(initialLang('?lang=xx', null, [])).toEqual({ lang: 'en', fromUrl: false });
  });

  it('keeps a choice once made, reviewed or not', () => {
    expect(initialLang('', 'cs', ['en'])).toEqual({ lang: 'cs', fromUrl: false });
  });

  it('follows the browser only to a reviewed language', () => {
    expect(initialLang('', null, ['cs-CZ', 'en'])).toEqual({ lang: LANGUAGES.cs.reviewed ? 'cs' : 'en', fromUrl: false });
  });
});
