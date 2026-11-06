import { describe, expect, it } from 'vitest';

import { crlFileName, fetchCrlCopy } from './crl-copy';

const DER = Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x01]);

const serving = (files: Record<string, Uint8Array | string>) =>
  (async (input: RequestInfo | URL) => {
    const body = files[String(input)];
    return new Response((body ?? '<!doctype html>') as BodyInit, { status: body === undefined ? 404 : 200 });
  }) as typeof fetch;

describe('naming a copy', () => {
  it('is the same over http and https, since the same list is served on both', async () => {
    expect(await crlFileName('http://cdp1.example.org/a.crl')).toBe(await crlFileName('https://cdp1.example.org/a.crl'));
  });

  it('ignores the case of the host, not of the path', async () => {
    expect(await crlFileName('http://CDP1.example.org/a.crl')).toBe(await crlFileName('http://cdp1.example.org/a.crl'));
    expect(await crlFileName('http://cdp1.example.org/A.crl')).not.toBe(await crlFileName('http://cdp1.example.org/a.crl'));
  });

  it('tells two lists of one authority apart, which is why it goes by address', async () => {
    expect(await crlFileName('http://ca.example.org/part1.crl')).not.toBe(await crlFileName('http://ca.example.org/part2.crl'));
  });
});

describe('finding a copy', () => {
  const name = async (url: string) => `/x/crls/${await crlFileName(url)}.crl`;

  it('finds the list the certificate names', async () => {
    const url = 'http://ca.example.org/a.crl';
    expect(await fetchCrlCopy('/x/', [url], serving({ [await name(url)]: DER }))).toEqual(DER);
  });

  it('tries the next address the certificate names', async () => {
    const second = 'http://mirror.example.org/a.crl';
    expect(await fetchCrlCopy('/x/', ['http://ca.example.org/a.crl', second], serving({ [await name(second)]: DER }))).toEqual(DER);
  });

  it('says so when there is no copy', async () => {
    expect(await fetchCrlCopy('/x/', ['http://ca.example.org/a.crl'], serving({}))).toBe('absent');
  });

  it('is not fooled by a host answering every address with its page', async () => {
    const url = 'http://ca.example.org/a.crl';
    expect(await fetchCrlCopy('/x/', [url], serving({ [await name(url)]: '<!doctype html><html></html>' }))).toBe('absent');
  });

  it('tells being offline apart from there being no copy', async () => {
    const offline = (async () => {
      throw new TypeError('offline');
    }) as typeof fetch;
    expect(await fetchCrlCopy('/x/', ['http://ca.example.org/a.crl'], offline)).toBe('unreachable');
  });

  it('asks for nothing when the certificate names no list', async () => {
    expect(await fetchCrlCopy('/x/', [], serving({}))).toBe('absent');
  });
});
