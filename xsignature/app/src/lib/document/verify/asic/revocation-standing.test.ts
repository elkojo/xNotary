import { describe, expect, it } from 'vitest';

import type { CarriedAnswer } from './proven-answer';
import type { RevocationAnswer } from './revocation';
import { levelIsConfirmed, listBacksSignature, reportedAnswer, revocationStanding } from './revocation-standing';

const answer = (status: RevocationAnswer['status'], standing: RevocationAnswer['standing'] = 'holds') => ({ status, standing }) as RevocationAnswer;
const proven = (status: RevocationAnswer['status']): CarriedAnswer => ({ answer: answer(status), proof: 'delegated' });
const unproven = (status: RevocationAnswer['status']): CarriedAnswer => ({ answer: answer(status), proof: null });

const nothing = { listAnswer: null, listSettles: false, carried: null, carriedSettles: false };

describe('a carried answer', () => {
  it('clears the certificate only when proven and settling', () => {
    expect(revocationStanding({ ...nothing, carried: proven('good'), carriedSettles: true }).clearedByAnswer).toBe(true);
    expect(revocationStanding({ ...nothing, carried: proven('good'), carriedSettles: false }).clearedByAnswer).toBe(false);
    expect(revocationStanding({ ...nothing, carried: unproven('good'), carriedSettles: true }).clearedByAnswer).toBe(false);
  });

  it('that clears it leaves the list unneeded; one that does not, needed', () => {
    expect(revocationStanding({ ...nothing, carried: proven('good'), carriedSettles: true }).listNeeded).toBe(false);
    expect(revocationStanding({ ...nothing, carried: unproven('good'), carriedSettles: true }).listNeeded).toBe(true);
    expect(revocationStanding(nothing).listNeeded).toBe(true);
  });

  it('a settling judgement never clears a "revoked"', () => {
    expect(revocationStanding({ ...nothing, carried: proven('revoked'), carriedSettles: true }).clearedByAnswer).toBe(false);
  });

  it('a proven "revoked" is known, and asks nothing of the list', () => {
    expect(revocationStanding({ ...nothing, carried: proven('revoked') })).toMatchObject({ knownRevoked: true, provenRevoked: true, listNeeded: false });
  });
});

describe('a "revoked" anyone could have added', () => {
  it('counts until the issuer\'s list clears it', () => {
    expect(revocationStanding({ ...nothing, carried: unproven('revoked') })).toMatchObject({ knownRevoked: true, listNeeded: true });
    expect(revocationStanding({ ...nothing, carried: unproven('revoked'), listAnswer: answer('good'), listSettles: true }).knownRevoked).toBe(false);
  });

  it('a list that settles nothing does not clear it', () => {
    expect(revocationStanding({ ...nothing, carried: unproven('revoked'), listAnswer: answer('good'), listSettles: false }).knownRevoked).toBe(true);
  });

  it('one that does not verify counts for nothing', () => {
    expect(revocationStanding({ ...nothing, carried: { answer: answer('revoked', 'broken'), proof: null } }).knownRevoked).toBe(false);
  });
});

describe('the issuer\'s list', () => {
  it('naming the certificate stops any green, and stays on screen, even beside a proven settling answer', () => {
    const standing = revocationStanding({ ...nothing, listAnswer: answer('revoked'), carried: proven('good'), carriedSettles: true });
    expect(standing).toMatchObject({ listSaysRevoked: true, knownRevoked: true, clearedByAnswer: false, listNeeded: true });
  });

  it('clears only when it verifies, says good and settles', () => {
    expect(revocationStanding({ ...nothing, listAnswer: answer('good'), listSettles: true }).clearedByList).toBe(true);
    expect(revocationStanding({ ...nothing, listAnswer: answer('good'), listSettles: false }).clearedByList).toBe(false);
    expect(revocationStanding({ ...nothing, listAnswer: answer('good', 'broken'), listSettles: true }).clearedByList).toBe(false);
    expect(revocationStanding({ ...nothing, listAnswer: answer('good', 'cannot-check'), listSettles: true }).clearedByList).toBe(false);
  });

  it('that does not verify is no revocation', () => {
    expect(revocationStanding({ ...nothing, listAnswer: answer('revoked', 'broken') }).knownRevoked).toBe(false);
  });
});

describe('the level', () => {
  const all = { holds: true, qualified: true, independentTime: true, validWhenUsed: true, knownRevoked: false };

  it('is backed only when every condition holds', () => {
    expect(listBacksSignature(all)).toBe(true);
    for (const missing of ['holds', 'qualified', 'independentTime', 'validWhenUsed'] as const) {
      expect(listBacksSignature({ ...all, [missing]: false })).toBe(false);
    }
    expect(listBacksSignature({ ...all, knownRevoked: true })).toBe(false);
  });

  it('is green only on the newest copy, not overdue, with the device settled', () => {
    const green = { listBacksIt: true, confirmedCurrent: true, listOverdue: false, deviceSettled: true };
    expect(levelIsConfirmed(green)).toBe(true);
    expect(levelIsConfirmed({ ...green, listBacksIt: false })).toBe(false);
    expect(levelIsConfirmed({ ...green, confirmedCurrent: false })).toBe(false);
    expect(levelIsConfirmed({ ...green, listOverdue: true })).toBe(false);
    expect(levelIsConfirmed({ ...green, deviceSettled: false })).toBe(false);
  });
});

describe('which answer is reported', () => {
  it('before reading again, the first reading, unproven', () => {
    expect(reportedAnswer(null, null, answer('good'))).toEqual({ answer: answer('good'), proof: null });
    expect(reportedAnswer(null, null, null)).toBeNull();
    expect(reportedAnswer(null, null, undefined)).toBeNull();
  });

  it('after reading again, that reading stands, even when it finds the first was about another key', () => {
    expect(reportedAnswer([], null, answer('revoked'))).toBeNull();
    const chosen = proven('good');
    expect(reportedAnswer([chosen], chosen, answer('revoked'))).toBe(chosen);
  });
});
