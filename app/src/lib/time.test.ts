import { describe, expect, it } from 'vitest';
import { localStamp, utcStamp } from './time';

const WHEN = new Date(Date.UTC(2026, 6, 30, 18, 4, 0));

describe('utcStamp', () => {
  it('writes the time out in UTC and says so', () => {
    expect(utcStamp(WHEN)).toBe('2026-07-30 18:04:00 UTC');
  });
});

describe('localStamp', () => {
  /**
   * Regression: this used to ask for `dateStyle` + `timeStyle` alongside
   * `timeZoneName`, which ECMA-402 rejects with a TypeError rather than
   * ignoring. Every call threw, and because one of them happened inside the
   * certificate list's render, the list never appeared at all.
   */
  it('does not throw', () => {
    expect(() => localStamp(WHEN)).not.toThrow();
    expect(() => localStamp(WHEN.getTime())).not.toThrow();
  });

  it('names the zone, so two readers cannot disagree about when', () => {
    const stamped = localStamp(WHEN);
    expect(stamped).toContain('2026');
    // Whatever the runtime's zone is, its short name is appended.
    expect(stamped.length).toBeGreaterThan('30 Jul 2026, 18:04:00'.length);
    expect(stamped).toMatch(/[A-Z]{2,5}|GMT[+-]?\d*/);
  });

  it('accepts a timestamp and a Date interchangeably', () => {
    expect(localStamp(WHEN)).toBe(localStamp(WHEN.getTime()));
  });
});
