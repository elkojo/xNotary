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
 * certificate whose key verified the signer's, not merely one of the right name.
 */
import type { Certificate } from 'pkijs';

import { isForOcspSigning, listedResponder, type DirectorySource } from '../../certificate/read/directory';
import type { ListedService } from '../../certificate/read/trusted-list';
import { timeAuthorityGrantedAt } from '../trust';
import type { RevocationAnswer } from './revocation';

export type AnswerProof = 'issuer' | 'delegated' | 'listed';

const keyOf = (certificate: Certificate): string =>
  [...new Uint8Array(certificate.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView)].join(',');

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
  if (answer.standing !== 'holds' || !made || !answer.at) return null;

  if (issuer) {
    if (keyOf(made) === keyOf(issuer)) return 'issuer';

    // Only OCSP may be delegated. A CRL signed by another key says nothing here.
    if (answer.kind === 'OCSP' && isForOcspSigning(made) && withinDates(made, answer.at)) {
      try {
        if (made.issuer.isEqual(issuer.subject) && (await made.verify(issuer))) return 'delegated';
      } catch {
        // Not verifiable through this issuer. The list may still know it.
      }
    }
  }

  if (answer.kind !== 'OCSP' || !issuerListing) return null;
  const listed = await listedResponder(made, source);
  if (!listed || listed.list !== issuerListing.list) return null;
  if (!timeAuthorityGrantedAt(listed.services, answer.at)) return null;
  if (!listed.certificates.some((certificate) => withinDates(certificate, answer.at!))) return null;

  // The same provider: a responder on the list speaks for its own provider's certificates.
  const issuerNames = new Set(issuerListing.services.flatMap((service) => service.n).map(names));
  return listed.services.some((service) => service.n.some((name) => issuerNames.has(names(name)))) ? 'listed' : null;
}
