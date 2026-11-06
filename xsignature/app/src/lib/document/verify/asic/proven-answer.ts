/**
 * Whether a revocation answer a signature carries could only have come from the right party.
 *
 * Verifying an embedded answer shows only that the certificate it names made it, and anyone can make
 * a certificate. So on its own it is a claim. It becomes evidence when that certificate had the right
 * to answer about this signer, and that can be established without trusting the file:
 *
 *  - `issuer`: made with the key of the authority that issued the signer's certificate.
 *  - `delegated`: made by a responder that authority certified, for OCSP signing, with its own key.
 *  - `listed`: made by a responder a verified trusted list records as granted at that time, under the
 *    same provider as the authority that issued the signer's certificate.
 *
 * Anything else is null, and stays a plain statement of what the file says. `issuer` here has to be the
 * certificate whose key verified the signer's, not merely one of the right name. Without one, nothing
 * can be proven: nobody can say who had the right to answer about a certificate of unknown origin.
 */
import type { Certificate } from 'pkijs';

import { DirectoryUnreachable, isForOcspSigning, listedResponder, type DirectorySource } from '../../certificate/read/directory';
import type { ListedService } from '../../certificate/read/trusted-list';
import { grantedAndInDates } from '../trust';
import { revocationsOf, type EmbeddedRevocation, type RevocationAnswer } from './revocation';
import { digest, sameBytes } from './xml';

export type AnswerProof = 'issuer' | 'delegated' | 'listed';

/** What a signature carried, to be read again once more is known about its issuer. */
export interface CarriedEvidence {
  readonly embedded: EmbeddedRevocation;
  readonly certificates: readonly Certificate[];
}

export interface CarriedAnswer {
  readonly answer: RevocationAnswer;
  readonly proof: AnswerProof | null;
}

const keyOf = (certificate: Certificate): Uint8Array =>
  new Uint8Array(certificate.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView);

export const sameKey = (a: Certificate, b: Certificate): boolean => sameBytes(keyOf(a), keyOf(b));

const withinDates = (certificate: Certificate, time: Date): boolean =>
  certificate.notBefore.value.getTime() <= time.getTime() && time.getTime() <= certificate.notAfter.value.getTime();

const names = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export async function proveAnswer(
  answer: RevocationAnswer,
  issuer: Certificate | null,
  issuerListing: { readonly list: string; readonly services: readonly ListedService[] } | null,
  source: DirectorySource,
): Promise<AnswerProof | null> {
  const made = answer.madeBy;
  if (!issuer || answer.standing !== 'holds' || !made || !answer.at) return null;

  // An OCSP response names the key of the issuer it speaks for. Under any other key it is about some
  // other certificate of this authority, whoever made it.
  const about = answer.aboutIssuerKey;
  if (about && !sameBytes(await digest(about.hash, keyOf(issuer)), about.value)) return null;

  if (sameKey(made, issuer)) return 'issuer';

  if (answer.kind !== 'OCSP') return null;

  // Only OCSP may be delegated. A CRL signed by another key says nothing here.
  if (isForOcspSigning(made) && withinDates(made, answer.at)) {
    try {
      if (made.issuer.isEqual(issuer.subject) && (await made.verify(issuer))) return 'delegated';
    } catch {
      // Not verifiable through this issuer. The list may still know it.
    }
  }

  if (!issuerListing) return null;
  const listed = await listedResponder(made, source);
  if (!listed || listed.list !== issuerListing.list || !grantedAndInDates(listed, answer.at)) return null;

  // The same provider: a responder on the list speaks for its own provider's certificates.
  const issuerNames = new Set(issuerListing.services.flatMap((service) => service.n).map(names));
  return listed.services.some((service) => service.n.some((name) => issuerNames.has(names(name)))) ? 'listed' : null;
}

/**
 * Read every answer a signature carries about this certificate, against the established issuer as well
 * as the certificates in the file, and prove each one.
 *
 * Each on its own, because the worst answer need not be the one that counts: anyone can add a "revoked"
 * of their own making beside a genuine answer, and it must not be able to hide that answer. `unreachable`
 * says this site's directory could not be read, so an unproven answer might yet have been proven.
 */
export async function proveCarried(
  leaf: Certificate,
  evidence: CarriedEvidence,
  issuer: Certificate | null,
  issuerListing: { readonly list: string; readonly services: readonly ListedService[] } | null,
  source: DirectorySource,
): Promise<{ answers: CarriedAnswer[]; unreachable: boolean }> {
  const known = issuer ? [...evidence.certificates, issuer] : evidence.certificates;
  const answers: CarriedAnswer[] = [];
  let unreachable = false;
  for (const answer of await revocationsOf(leaf, known, evidence.embedded)) {
    let proof: AnswerProof | null = null;
    try {
      proof = await proveAnswer(answer, issuer, issuerListing, source);
    } catch (error) {
      if (!(error instanceof DirectoryUnreachable)) throw error;
      unreachable = true;
    }
    answers.push({ answer, proof });
  }
  return { answers, unreachable };
}

/**
 * What a "not revoked" that the right party gave comes to, by its status time, or null when it is not
 * that. It settles the question when it describes a moment after a time somebody independent confirmed,
 * while the authority still had to track this certificate.
 */
export function judgeNotRevoked(
  answer: RevocationAnswer,
  moment: { readonly time: Date; readonly independent: boolean } | null,
  leaf: Certificate,
): 'settles' | 'undated' | 'before-signature' | 'after-expiry' | null {
  const at = answer.statusAt;
  if (answer.status !== 'good' || !at) return null;
  if (!moment?.independent) return 'undated';
  if (at.getTime() < moment.time.getTime()) return 'before-signature';
  if (at.getTime() > leaf.notAfter.value.getTime() && !answer.keepsExpired) return 'after-expiry';
  return 'settles';
}

/**
 * The one to report. A proven "revoked" outranks everything; then a proven "not revoked" that settles
 * the question, by `settles`; then any other proven answer, newest first; then the worst of the rest.
 */
export function chooseCarried(answers: readonly CarriedAnswer[], settles: (answer: RevocationAnswer) => boolean): CarriedAnswer | null {
  const proven = answers
    .filter((carried) => carried.proof)
    .sort((a, b) => (b.answer.statusAt?.getTime() ?? 0) - (a.answer.statusAt?.getTime() ?? 0));
  return (
    proven.find((carried) => carried.answer.status === 'revoked') ??
    proven.find((carried) => carried.answer.status === 'good' && settles(carried.answer)) ??
    proven[0] ??
    answers[0] ??
    null
  );
}
