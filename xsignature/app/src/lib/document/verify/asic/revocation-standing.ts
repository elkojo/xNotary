/**
 * What the Check screen may say about revocation and the signature's level, given what it has found.
 *
 * These are the rules that decide what turns green, kept apart from the screen so that tests can hold
 * them to account. Nothing here reads a file or the network.
 */
import type { CarriedAnswer } from './proven-answer';
import type { RevocationAnswer } from './revocation';

export interface RevocationFindings {
  /** What the issuer's own revocation list said, from this site's copy or a file the reader brought. */
  readonly listAnswer: RevocationAnswer | null;
  /** That list's "not revoked" speaks for the moment of signing (`judgeNotRevoked`). */
  readonly listSettles: boolean;
  /** The answer the signature carries that is being reported, if any. */
  readonly carried: CarriedAnswer | null;
  /** That answer's "not revoked" speaks for the moment of signing (`judgeNotRevoked`). */
  readonly carriedSettles: boolean;
}

export interface RevocationStanding {
  readonly listSaysRevoked: boolean;
  readonly clearedByList: boolean;
  readonly clearedByAnswer: boolean;
  readonly provenRevoked: boolean;
  /** Something says this certificate was revoked, and no green may sit beside it. */
  readonly knownRevoked: boolean;
  /** The issuer's list still has something to say, or has said it and must stay on screen. */
  readonly listNeeded: boolean;
}

const verifiedRevoked = (answer: RevocationAnswer | null | undefined): boolean => answer?.standing === 'holds' && answer.status === 'revoked';

export function revocationStanding({ listAnswer, listSettles, carried, carriedSettles }: RevocationFindings): RevocationStanding {
  const listSaysRevoked = verifiedRevoked(listAnswer);
  const clearedByList = listAnswer?.standing === 'holds' && listAnswer.status === 'good' && listSettles;
  const proven = !!carried?.proof;
  const clearedByAnswer = proven && carried!.answer.status === 'good' && carriedSettles && !listSaysRevoked;
  const provenRevoked = proven && carried!.answer.status === 'revoked';
  return {
    listSaysRevoked,
    clearedByList,
    clearedByAnswer,
    provenRevoked,
    // The issuer's own list outranks an answer anyone could have added.
    knownRevoked: listSaysRevoked || provenRevoked || (verifiedRevoked(carried?.answer) && !clearedByList),
    // An answer that is not proven settles nothing, either way: anyone can add one, including a forged
    // "revoked" against somebody else's good signature. So the list is read, unless a proven answer has
    // already said what it would be asked. A list that named the certificate stays whatever else turns up.
    listNeeded: (!clearedByAnswer && !provenRevoked) || listSaysRevoked,
  };
}

/** Whether the trusted list backs this certificate at a time an authority dated, with nothing against it. */
export const listBacksSignature = (facts: {
  readonly holds: boolean;
  readonly qualified: boolean;
  readonly independentTime: boolean;
  readonly validWhenUsed: boolean;
  readonly knownRevoked: boolean;
}): boolean => facts.holds && facts.qualified && facts.independentTime && facts.validWhenUsed && !facts.knownRevoked;

/** Green only when all of it holds, the reader has confirmed the newest copy, and it has not outlived its list. */
export const levelIsConfirmed = (facts: {
  readonly listBacksIt: boolean;
  readonly confirmedCurrent: boolean;
  readonly listOverdue: boolean;
  readonly deviceSettled: boolean;
}): boolean => facts.listBacksIt && facts.confirmedCurrent && !facts.listOverdue && facts.deviceSettled;

/**
 * Which answer the screen reports. Once read again against what is now known, that reading stands, even
 * if it found nothing: the first reading may have counted an answer about another key of this authority.
 */
export const reportedAnswer = (
  readAgain: readonly CarriedAnswer[] | null,
  chosen: CarriedAnswer | null,
  firstReading: RevocationAnswer | null | undefined,
): CarriedAnswer | null => (readAgain ? chosen : firstReading ? { answer: firstReading, proof: null } : null);
