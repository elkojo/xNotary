import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIGHTNING,
  OFFERED_KEY,
  OFFER_DELAY_MS,
  SUPPORT_HREF,
  claimSupportOffer,
  lightningUri,
  resetSupportOfferForTests,
} from './support';

describe('support', () => {
  it('carries a real Lightning code, not the placeholder', () => {
    // An LNURL (bech32, "lnurl1…") or a Lightning address (name@domain).
    expect(LIGHTNING).toMatch(/^(lnurl1[02-9ac-hj-np-z]+|[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})$/i);
  });

  it('is one page for the whole site', () => {
    expect(SUPPORT_HREF).toBe('/support/');
  });

  it('opens a wallet with the code as wallets expect it', () => {
    expect(lightningUri('lnurl1dp68gurn8ghj7')).toBe('lightning:LNURL1DP68GURN8GHJ7');
    expect(lightningUri('tips@example.com')).toBe('lightning:tips@example.com');
  });
});

describe('the support dialog is offered once per session', () => {
  function store(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }

  beforeEach(() => resetSupportOfferForTests());

  it('offers it the first time and records that it did', () => {
    const s = store();
    expect(claimSupportOffer(s)).toBe(true);
    expect(s.data.get(OFFERED_KEY)).toBe('1');
  });

  it('never twice on one page, even if storage forgets', () => {
    expect(claimSupportOffer(store())).toBe(true);
    expect(claimSupportOffer(store())).toBe(false);
  });

  it('not again in a page loaded later in the same session', () => {
    const s = store();
    claimSupportOffer(s);
    resetSupportOfferForTests(); // a new page load: another service, or a reload
    expect(claimSupportOffer(s)).toBe(false);
  });

  it('still once per page when storage is refused', () => {
    const refusing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} };
    expect(claimSupportOffer(refusing)).toBe(true);
    expect(claimSupportOffer(refusing)).toBe(false);
    resetSupportOfferForTests();
    expect(claimSupportOffer(null)).toBe(true);
  });

  it('waits long enough for the download to be seen first', () => {
    expect(OFFER_DELAY_MS).toBeGreaterThanOrEqual(800);
  });
});
