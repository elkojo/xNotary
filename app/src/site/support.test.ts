import { describe, expect, it } from 'vitest';
import { LIGHTNING, SUPPORT_HREF, lightningUri } from './support';

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
