import { describe, expect, it } from 'vitest';

import {
  AUTHORITIES,
  AUTOMATIC,
  automaticOrder,
  checkAuthorityUrl,
  DEFAULT_CHOICE,
  STANDINGS,
  summary,
} from './authorities';

describe('the authority list', () => {
  it('reaches every authority over https', () => {
    // A timestamp fetched over plain http can be swapped on the way back, which
    // defeats the one thing it exists to establish.
    for (const authority of AUTHORITIES) {
      expect(authority.url.startsWith('https://')).toBe(true);
    }
  });

  it('defaults to Automatic', () => {
    expect(DEFAULT_CHOICE).toBe(AUTOMATIC);
  });

  it('has Automatic ask only qualified authorities, in list order', () => {
    // Falling through to a lesser authority would deliver less than the option
    // promised, without the reader having chosen it.
    const order = automaticOrder();
    expect(order.length).toBeGreaterThan(1);
    expect(order.every((a) => a.qualified && a.adobeTrusted)).toBe(true);
    const positions = order.map((a) => AUTHORITIES.indexOf(a));
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
  });

  it('places every authority in exactly one group', () => {
    for (const authority of AUTHORITIES) {
      expect(STANDINGS.filter((s) => s.has(authority))).toHaveLength(1);
    }
  });

  it('marks as relayed exactly the authorities reached through ai.moda', () => {
    for (const authority of AUTHORITIES) {
      expect(authority.relayed).toBe(new URL(authority.url).host === 'rfc3161.ai.moda');
    }
  });

  it('summarises from the facts, so the line cannot drift from them', () => {
    const sigstore = AUTHORITIES.find((a) => a.id === 'sigstore')!;
    expect(summary(sigstore)).toBe('Not qualified · Acrobat does not recognise it · reached directly');
  });

  it('offers a choice that does not go through a relay', () => {
    // The relay is a third party in the path and a single point of failure.
    // There has to be at least one way round it, whatever its other trade-offs.
    const direct = AUTHORITIES.filter((a) => !a.url.includes('ai.moda'));
    expect(direct.length).toBeGreaterThan(0);
  });

  it('says of every authority whether Acrobat will trust its signer', () => {
    for (const authority of AUTHORITIES) {
      expect(typeof authority.adobeTrusted).toBe('boolean');
      expect(authority.note.length).toBeGreaterThan(10);
    }
  });

  it('has no duplicate ids', () => {
    const ids = AUTHORITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('checkAuthorityUrl', () => {
  it('accepts an https address', () => {
    expect(checkAuthorityUrl('https://tsa.example.org/tsr')).toEqual({
      url: 'https://tsa.example.org/tsr',
    });
  });

  it('trims what was pasted', () => {
    expect(checkAuthorityUrl('  https://tsa.example.org/  ')).toEqual({
      url: 'https://tsa.example.org/',
    });
  });

  it('refuses http, and says why rather than just refusing', () => {
    const result = checkAuthorityUrl('http://timestamp.digicert.com');
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(/changed on the way back/);
  });

  it('refuses anything that is not a web address', () => {
    expect(checkAuthorityUrl('not a url')).toHaveProperty('error');
    expect(checkAuthorityUrl('ftp://example.org')).toHaveProperty('error');
  });

  it('asks for one rather than complaining when the field is empty', () => {
    expect(checkAuthorityUrl('   ')).toEqual({ error: 'Enter the address of a timestamp authority.' });
  });
});
