/**
 * What a trusted list says about a signer's certificate.
 *
 * The rules are ETSI TS 119 615, clauses 4.3 to 4.5: find the listed service that issued
 * the certificate, read its status at a given moment, then combine the service's
 * qualifiers with what the certificate says about itself (Tables 1, 2 and 7). Whatever this
 * cannot evaluate comes back `cannot-check`, never a guess.
 *
 * Two limits, both on purpose:
 *
 * - **Only from 1 July 2016.** Earlier dates fall under the Directive's rules, which are not
 *   implemented, so they are `cannot-check` rather than half-applied.
 * - **The answer is about the list, and the list is a copy.** It is as fresh as the date the
 *   site read it, and it says what the authority's supervisor recorded. It does not say the
 *   signature is valid, and nothing that uses it may: revocation and the signature itself are
 *   established separately, and the person behind the name not at all.
 *
 * This reports what a list says; it does not replace the validation Article 32 of eIDAS
 * describes, and only a certificate from a list whose signature was verified at build time
 * reaches it (`scripts/issuers.ts`).
 */
import type { Certificate } from 'pkijs';

import { RETYPED, type Criteria, type ListedService, type ServiceState } from '../certificate/read/trusted-list';
import { listedTimeAuthority, type DirectorySource } from '../certificate/read/directory';
import type { CertificateClaims } from './claims';

/** Directive 1999/93/EC ended here. PRO-4.4.4-07. */
const REGULATION_STARTS = Date.UTC(2016, 5, 30, 22);

export type ListResult =
  /** The list treats this certificate as qualified, at every moment that matters. */
  | 'qualified'
  /** The list does not. Its own say-so in the certificate is not enough. */
  | 'not-qualified'
  | 'cannot-check';

export interface ListStanding {
  readonly result: ListResult;
  /** Whether the list puts the key on a qualified device. Null when that was not reached. */
  readonly onQualifiedDevice: boolean | null;
  /** In the app's own voice, when the result is not `qualified`. */
  readonly detail: string;
}

/** The facts about a certificate these rules ask for. */
export interface CertificateFacts {
  readonly qualified: boolean;
  readonly onQualifiedDevice: boolean;
  /** QcType identifiers: 1 signature, 2 seal, 3 website. */
  readonly types: readonly (1 | 2 | 3)[];
  readonly policies: readonly string[];
  readonly keyUsage: CertificateClaims['keyUsage'];
  readonly notBefore: Date;
  readonly notAfter: Date;
  readonly issuerCountry: string | null;
  readonly issuerOrganization: string | null;
}

/** The entry that applies at a moment: the current one, or the first history entry not after it. */
function stateAt(service: ListedService, moment: Date): ServiceState | null {
  // Newest first, as the list writes them.
  return service.h.find((state) => new Date(state.t).getTime() <= moment.getTime()) ?? null;
}

type CriteriaAnswer = boolean | 'unknown';

/** Whether a `CriteriaList` identifies this certificate. Anything unread is `unknown`, not false. */
function matches(criteria: Criteria, certificate: CertificateFacts): CriteriaAnswer {
  const answers: CriteriaAnswer[] = [];
  for (const policySet of criteria.p ?? []) answers.push(policySet.every((oid) => certificate.policies.includes(oid)));
  for (const bits of criteria.k ?? []) {
    if (!certificate.keyUsage.stated) {
      answers.push(false);
      continue;
    }
    if (bits.some(([name]) => name !== 'digitalSignature' && name !== 'nonRepudiation')) {
      answers.push('unknown');
      continue;
    }
    answers.push(bits.every(([name, expected]) => certificate.keyUsage[name as 'digitalSignature' | 'nonRepudiation'] === expected));
  }
  for (const nested of criteria.n ?? []) answers.push(matches(nested, certificate));
  if (criteria.x) answers.push('unknown');

  const known = answers.filter((answer): answer is boolean => answer !== 'unknown');
  const anyUnknown = answers.includes('unknown');
  switch (criteria.a) {
    case 'all':
      if (known.includes(false)) return false;
      return anyUnknown ? 'unknown' : true;
    case 'atLeastOne':
      if (known.includes(true)) return true;
      return anyUnknown ? 'unknown' : false;
    case 'none':
      if (known.includes(true)) return false;
      return anyUnknown ? 'unknown' : true;
    default:
      return 'unknown';
  }
}

type Purpose = 'esig' | 'eseal';
type Check = 'yes' | 'no' | 'indeterminate';

/** Tables 1 and 2. A qualifier always wins over the certificate, and the order below is the tables'. */
function fromTable(purpose: Purpose, certificate: CertificateFacts, qualifiers: ReadonlySet<string>): Check {
  const own = purpose === 'esig' ? 1 : 2;
  const forPurpose = qualifiers.has(purpose === 'esig' ? 'QCForESig' : 'QCForESeal');
  const statement = qualifiers.has('QCStatement');
  const compliant = certificate.qualified;

  const hasOwn = certificate.types.includes(own);
  const hasOther = certificate.types.some((type) => type !== own);
  // An eSig certificate need not state a type; a seal has to.
  const ownByDefault = purpose === 'esig' && certificate.types.length === 0;

  if (qualifiers.has('NotQualified')) return 'no';
  if (statement && forPurpose) return 'yes';
  if (forPurpose) return compliant ? 'yes' : 'no';

  if (statement) {
    if (hasOwn && hasOther) return 'indeterminate';
    if (hasOwn || ownByDefault) return compliant || hasOwn ? 'yes' : 'indeterminate';
    if (!compliant && certificate.types.length === 0) return 'indeterminate';
    return 'no';
  }

  if (!compliant) return 'no';
  if (hasOwn && hasOther) return 'indeterminate';
  return hasOwn || ownByDefault ? 'yes' : 'no';
}

/** The qualifiers on these states that apply to this certificate, or null when one cannot be told. */
function applicable(states: readonly ServiceState[], certificate: CertificateFacts): { qualifiers: Set<string>; unknown: boolean } {
  const qualifiers = new Set<string>();
  let unknown = false;
  for (const state of states) {
    for (const element of state.q ?? []) {
      const answer = matches(element.c, certificate);
      if (answer === 'unknown') unknown = true;
      if (answer === true) for (const qualifier of element.q) qualifiers.add(qualifier);
    }
  }
  return { qualifiers, unknown };
}

const FOR: Record<Purpose, { additional: string; foreign: readonly string[] }> = {
  esig: { additional: 'ForeSignatures', foreign: ['QCForESeal', 'QCForWSA', 'QCForLegalPerson'] },
  eseal: { additional: 'ForeSeals', foreign: ['QCForESig', 'QCForWSA'] },
};

interface MomentAnswer {
  readonly check: Check;
  readonly qualifiers: ReadonlySet<string>;
}

/** PRO-4.4.4-10 onward, for one purpose at one moment. */
function checkPurpose(purpose: Purpose, states: readonly ServiceState[], certificate: CertificateFacts): MomentAnswer {
  const none = new Set<string>();
  const relevant = states.filter((state) => (state.a ?? []).includes(FOR[purpose].additional));
  if (relevant.length === 0 || relevant.some((state) => state.s === 'withdrawn')) return { check: 'no', qualifiers: none };
  if (relevant.some((state) => state.s !== 'granted')) return { check: 'indeterminate', qualifiers: none };

  const { qualifiers, unknown } = applicable(relevant, certificate);
  if (unknown) return { check: 'indeterminate', qualifiers };
  // The tables' own inconsistencies: a list saying two things at once.
  if (FOR[purpose].foreign.some((name) => qualifiers.has(name))) return { check: 'indeterminate', qualifiers };
  if (qualifiers.has('NotQualified') && qualifiers.has('QCStatement')) return { check: 'indeterminate', qualifiers };

  return { check: fromTable(purpose, certificate, qualifiers), qualifiers };
}

/** Table 7. Null is the standard's QSCD_INDETERMINATE. */
function deviceFrom(qualifiers: ReadonlySet<string>, certificate: CertificateFacts): boolean | null {
  const yes = qualifiers.has('QCWithQSCD') || qualifiers.has('QCQSCDManagedOnBehalf');
  const no = qualifiers.has('QCNoQSCD');
  const asInCertificate = qualifiers.has('QCQSCDStatusAsInCert');
  if ((qualifiers.has('QCWithSSCD') && !qualifiers.has('QCWithQSCD')) || (qualifiers.has('QCNoSSCD') && !no)) return null;
  if (no && qualifiers.has('QCWithQSCD')) return null;
  if (no && qualifiers.has('QCQSCDManagedOnBehalf')) return null;
  if (asInCertificate && (yes || no)) return null;
  if (no) return false;
  if (yes) return true;
  return certificate.onQualifiedDevice;
}

const bothMoments = (values: ReadonlyArray<boolean | null>): boolean | null =>
  values.every((value) => value === values[0]) ? values[0] : null;

const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const cannot = (detail: string): ListStanding => ({ result: 'cannot-check', onQualifiedDevice: null, detail });

/**
 * What the list says about this certificate at `moment`.
 *
 * Checked at the moment it was used and at the moment it was issued, because a certificate
 * must have been qualified at both (TS 119 172-4; the EU's DSS does the same).
 */
export function checkAgainstList(
  services: readonly ListedService[],
  list: string,
  certificate: CertificateFacts,
  moment: Date,
): ListStanding {
  if (services.length === 0) return cannot('This list gives nothing to check against.');
  if (moment.getTime() < REGULATION_STARTS || certificate.notBefore.getTime() < REGULATION_STARTS) {
    return cannot('It dates from before 1 July 2016, when older rules applied that this check does not read.');
  }

  // A certificate outside its own dates was not a qualified certificate then, whatever the list says.
  if (moment.getTime() < certificate.notBefore.getTime() || moment.getTime() > certificate.notAfter.getTime()) {
    return { result: 'not-qualified', onQualifiedDevice: null, detail: 'The certificate was not valid at that time.' };
  }

  // PRO-4.4.4-01: the certificate's issuer has to belong to the country whose list this is.
  const country = certificate.issuerCountry?.toUpperCase();
  const expected = country === 'GR' ? 'EL' : country === 'GB' ? 'UK' : country;
  if (expected !== list) return cannot('Its issuer names a different country than the list it was found on.');

  // PRO-4.4.4-06: and the organisation it names has to be the listed provider.
  if (certificate.issuerOrganization) {
    const named = plain(certificate.issuerOrganization);
    if (!services.some((service) => service.n.some((name) => plain(name) === named))) {
      return cannot('The organisation its issuer names is not the provider the list records.');
    }
  }

  const answers: Array<{ esig: MomentAnswer; eseal: MomentAnswer }> = [];
  for (const when of [moment, certificate.notBefore]) {
    const states = services
      .map((service) => stateAt(service, when))
      .filter((state): state is ServiceState => state !== null && state.s !== RETYPED);
    if (states.length === 0) {
      return { result: 'not-qualified', onQualifiedDevice: null, detail: 'The provider was not on the list at that time.' };
    }
    answers.push({ esig: checkPurpose('esig', states, certificate), eseal: checkPurpose('eseal', states, certificate) });
  }

  const purposes: Purpose[] = ['esig', 'eseal'];
  const yes = purposes.filter((purpose) => answers.every((answer) => answer[purpose].check === 'yes'));
  if (yes.length === 2) return cannot('The list treats it as qualified for two purposes at once.');
  if (yes.length === 1) {
    return {
      result: 'qualified',
      // Qualified at both moments means on a device at both, or the list has not settled it.
      onQualifiedDevice: bothMoments(answers.map((answer) => deviceFrom(answer[yes[0]].qualifiers, certificate))),
      detail: '',
    };
  }
  if (purposes.some((purpose) => answers.some((answer) => answer[purpose].check === 'indeterminate'))) {
    return cannot('What the list says about it cannot be settled by these rules.');
  }
  return { result: 'not-qualified', onQualifiedDevice: null, detail: 'The list does not treat it as a qualified certificate.' };
}

/**
 * Whether a listed service was operating under supervision at that moment. Lists before 2016 say so in
 * other words. Weaker than granted, which is the right question for an authority's standing to speak
 * for its past certificates, not for whether it could date something.
 */
const ACTIVE = new Set(['granted', 'undersupervision', 'accredited', 'supervisionincessation']);
export const serviceActiveAt = (services: readonly ListedService[], moment: Date): boolean =>
  services.some((service) => ACTIVE.has(stateAt(service, moment)?.s ?? ''));

/** Whether a listed service was granted at that moment, by its own history. */
export const serviceGrantedAt = (services: readonly ListedService[], moment: Date): boolean =>
  services.some((service) => stateAt(service, moment)?.s === 'granted');

/**
 * Whether a listed authority could act at that moment: granted, and within the dates of the listed
 * certificate. A self-made certificate over a listed key states whatever dates it likes, so only the
 * listed one's count. A listed authority's expired or leaked key must not be able to date anything.
 */
export const grantedAndInDates = (listed: { readonly services: readonly ListedService[]; readonly certificates: readonly Certificate[] }, moment: Date): boolean =>
  serviceGrantedAt(listed.services, moment) &&
  listed.certificates.some(
    (evidence) => evidence.notBefore.value.getTime() <= moment.getTime() && moment.getTime() <= evidence.notAfter.value.getTime(),
  );

/**
 * The trusted list a timestamp's time rests on, or null when it rests on none: its authority is on a
 * verified list, granted at the time stated, and that time falls within its own certificate's dates.
 */
export async function confirmedTimeAuthority(certificate: Certificate, time: Date, source: DirectorySource): Promise<string | null> {
  const listed = await listedTimeAuthority(certificate, source);
  return listed && grantedAndInDates(listed, time) ? listed.list : null;
}

/** The certificate's own side of the question, from what the claims reader already parsed. */
export function factsOf(certificate: Certificate, claims: CertificateClaims, types: readonly (1 | 2 | 3)[]): CertificateFacts {
  const name = (oid: string): string | null => {
    const part = certificate.issuer.typesAndValues.find((candidate) => candidate.type === oid);
    return (part?.value.valueBlock.value as string | undefined) ?? null;
  };
  const policies = certificate.extensions?.find((extension) => extension.extnID === '2.5.29.32')?.parsedValue as
    | { certificatePolicies?: Array<{ policyIdentifier: string }> }
    | undefined;
  return {
    qualified: claims.qualified,
    onQualifiedDevice: claims.onQualifiedDevice,
    types,
    policies: policies?.certificatePolicies?.map((policy) => policy.policyIdentifier) ?? [],
    keyUsage: claims.keyUsage,
    notBefore: certificate.notBefore.value,
    notAfter: certificate.notAfter.value,
    issuerCountry: name('2.5.4.6'),
    issuerOrganization: name('2.5.4.10'),
  };
}
