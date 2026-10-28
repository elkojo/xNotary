import { describe, expect, it } from 'vitest';
import { VERSION_URL, holdRefresh, versionLabel, readBuild, refreshWouldLoseWork, servedBuild, shouldOffer } from './update-check';

const respond = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe('readBuild', () => {
  it('takes the build id from a version file', () => {
    expect(readBuild({ version: '0.9.0', build: 'v0.9.0' })).toBe('v0.9.0');
  });

  it('refuses anything that is not one', () => {
    expect(readBuild(null)).toBeNull();
    expect(readBuild('v0.9.0')).toBeNull();
    expect(readBuild({ build: 9 })).toBeNull();
    expect(readBuild({ build: '  ' })).toBeNull();
  });
});

describe('shouldOffer', () => {
  it('offers a refresh only when the site serves another build', () => {
    expect(shouldOffer('v0.9.1', 'v0.9.0', null)).toBe(true);
    expect(shouldOffer('v0.9.0', 'v0.9.0', null)).toBe(false);
  });

  it('never offers on a failed check', () => {
    expect(shouldOffer(null, 'v0.9.0', null)).toBe(false);
  });

  it('does not offer again a build this tab set aside — so a stale edge cannot loop the refresh', () => {
    expect(shouldOffer('v0.9.1', 'v0.9.0', 'v0.9.1')).toBe(false);
    // A newer one still gets through.
    expect(shouldOffer('v0.9.2', 'v0.9.0', 'v0.9.1')).toBe(true);
  });
});

describe('servedBuild', () => {
  it('asks the site root, past every cache', async () => {
    let asked: [RequestInfo | URL, RequestInit | undefined] | null = null;
    const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
      asked = [url, init];
      return new Response('{"build":"v0.9.0"}');
    }) as typeof fetch;
    expect(await servedBuild(fetchFn)).toBe('v0.9.0');
    expect(asked).toEqual([VERSION_URL, { cache: 'no-store' }]);
  });

  it('reads a failure as no news, never as an update', async () => {
    expect(await servedBuild(respond(404, { build: 'x' }))).toBeNull();
    expect(await servedBuild((async () => new Response('<!doctype html>')) as typeof fetch)).toBeNull();
    expect(await servedBuild((async () => Promise.reject(new TypeError('offline'))) as typeof fetch)).toBeNull();
  });
});

describe('holdRefresh', () => {
  it('holds while any view has unsaved work, and only then', () => {
    expect(refreshWouldLoseWork()).toBe(false);
    const a = holdRefresh();
    const b = holdRefresh();
    a();
    expect(refreshWouldLoseWork()).toBe(true);
    b();
    expect(refreshWouldLoseWork()).toBe(false);
  });
});

describe('versionLabel', () => {
  it('says only the release for a build from its tag, or one without git', () => {
    expect(versionLabel('0.9.0', 'v0.9.0')).toBe('Version 0.9.0');
    expect(versionLabel('0.9.0', '0.9.0')).toBe('Version 0.9.0');
  });

  it('names any other build', () => {
    expect(versionLabel('0.9.0', 'v0.9.0-3-gf9909aa-dirty')).toBe('Version 0.9.0 · v0.9.0-3-gf9909aa-dirty');
  });
});
