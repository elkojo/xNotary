import { describe, expect, it } from 'vitest';

import type { ListedService, QualificationElement, ServiceState } from '../certificate/read/trusted-list';
import { checkAgainstList, timeAuthorityGrantedAt, type CertificateFacts } from './trust';

const SIGNED = new Date('2026-03-01T10:00:00Z');

const facts = (over: Partial<CertificateFacts> = {}): CertificateFacts => ({
  qualified: true,
  onQualifiedDevice: true,
  types: [1],
  policies: ['1.2.3.4'],
  keyUsage: { digitalSignature: false, nonRepudiation: true, stated: true },
  notBefore: new Date('2025-01-01T00:00:00Z'),
  notAfter: new Date('2028-01-01T00:00:00Z'),
  issuerCountry: 'SK',
  issuerOrganization: 'Národná agentúra',
  ...over,
});

const qualifier = (names: string[], policy = '1.2.3.4'): QualificationElement => ({ q: names, c: { a: 'atLeastOne', p: [[policy]] } });

const state = (over: Partial<ServiceState> = {}): ServiceState => ({
  s: 'granted',
  t: '2020-01-01T00:00:00Z',
  a: ['ForeSignatures'],
  ...over,
});

const service = (...states: ServiceState[]): ListedService => ({ n: ['Narodna agentura', 'Other Name'], h: states.length ? states : [state()] });

const check = (services: ListedService[], certificate = facts(), moment = SIGNED) => checkAgainstList(services, 'SK', certificate, moment);

describe('a certificate from a granted service', () => {
  it('is qualified when it says so and the list sets nothing against it', () => {
    expect(check([service()])).toMatchObject({ result: 'qualified', onQualifiedDevice: true });
  });

  it('takes the device from the certificate when the list does not say', () => {
    expect(check([service()], facts({ onQualifiedDevice: false }))).toMatchObject({ result: 'qualified', onQualifiedDevice: false });
  });

  it('treats no stated type as a signature, per Table 1', () => {
    expect(check([service()], facts({ types: [] })).result).toBe('qualified');
  });

  it('is not qualified when the certificate does not say so and the list adds nothing', () => {
    expect(check([service()], facts({ qualified: false, types: [] })).result).toBe('not-qualified');
  });
});

describe('the certificate\'s own dates', () => {
  it('is not qualified at a time outside them, however the service stands', () => {
    expect(check([service()], facts(), new Date('2028-06-01T00:00:00Z')).result).toBe('not-qualified');
    expect(check([service()], facts(), new Date('2024-06-01T00:00:00Z')).result).toBe('not-qualified');
  });
});

describe('the status at the time', () => {
  const withdrawnLater = service(state({ s: 'withdrawn', t: '2026-06-01T00:00:00Z' }), state());
  const withdrawnEarlier = service(state({ s: 'withdrawn', t: '2026-01-01T00:00:00Z' }), state());

  it('reads the status in force then, not today\'s', () => {
    expect(check([withdrawnLater]).result).toBe('qualified');
  });

  it('is not qualified if the service had been withdrawn by then', () => {
    expect(check([withdrawnEarlier]).result).toBe('not-qualified');
  });

  it('must also have been granted when the certificate was issued', () => {
    const grantedAfterIssue = service(state({ t: '2025-06-01T00:00:00Z' }));
    expect(check([grantedAfterIssue]).result).toBe('not-qualified');
  });

  it('stops applying where the service became another type', () => {
    const retyped = service({ s: 'retyped', t: '2026-01-01T00:00:00Z' }, state());
    expect(check([retyped]).result).toBe('not-qualified');
    expect(check([retyped], facts(), new Date('2025-06-01T00:00:00Z')).result).toBe('qualified');
    expect(timeAuthorityGrantedAt([retyped], SIGNED)).toBe(false);
    expect(timeAuthorityGrantedAt([retyped], new Date('2025-06-01T00:00:00Z'))).toBe(true);
  });

  it('does not guess at a status the rules do not recognise', () => {
    expect(check([service(state({ s: 'somethingelse' }))]).result).toBe('cannot-check');
  });

  it('says nothing about a date under the older rules', () => {
    expect(check([service()], facts(), new Date('2015-01-01T00:00:00Z')).result).toBe('cannot-check');
    expect(check([service()], facts({ notBefore: new Date('2015-01-01T00:00:00Z') })).result).toBe('cannot-check');
  });
});

describe('qualifiers override what the certificate says', () => {
  const withQualifiers = (...names: string[]) => service(state({ q: [qualifier(names)] }));

  it('NotQualified wins', () => {
    expect(check([withQualifiers('NotQualified')]).result).toBe('not-qualified');
  });

  it('QCForESig needs QcCompliance in the certificate', () => {
    expect(check([withQualifiers('QCForESig')]).result).toBe('qualified');
    expect(check([withQualifiers('QCForESig')], facts({ qualified: false })).result).toBe('not-qualified');
  });

  it('QCStatement with QCForESig settles it either way', () => {
    expect(check([withQualifiers('QCStatement', 'QCForESig')], facts({ qualified: false, types: [] })).result).toBe('qualified');
  });

  it('QCStatement alone cannot settle a certificate that says nothing', () => {
    expect(check([withQualifiers('QCStatement')], facts({ qualified: false, types: [] })).result).toBe('cannot-check');
  });

  it('a list contradicting itself is not resolved here', () => {
    expect(check([withQualifiers('NotQualified', 'QCStatement')]).result).toBe('cannot-check');
    expect(check([withQualifiers('QCForESeal')]).result).toBe('cannot-check');
  });

  it('only applies to certificates its criteria identify', () => {
    const other = service(state({ q: [qualifier(['NotQualified'], '9.9.9')] }));
    expect(check([other]).result).toBe('qualified');
  });

  it('will not guess at a criterion it does not read', () => {
    const unread = service(state({ q: [{ q: ['NotQualified'], c: { a: 'atLeastOne', x: true } }] }));
    expect(check([unread]).result).toBe('cannot-check');
  });

  it('will not guess at a key usage bit it does not read', () => {
    const unread = service(state({ q: [{ q: ['NotQualified'], c: { a: 'atLeastOne', k: [[['keyEncipherment', true]]] } }] }));
    expect(check([unread]).result).toBe('cannot-check');
  });

  it('evaluates key usage criteria', () => {
    const byKeyUsage = service(state({ q: [{ q: ['NotQualified'], c: { a: 'atLeastOne', k: [[['nonRepudiation', true]]] } }] }));
    expect(check([byKeyUsage]).result).toBe('not-qualified');
    expect(check([byKeyUsage], facts({ keyUsage: { digitalSignature: true, nonRepudiation: false, stated: true } })).result).toBe('qualified');
  });
});

describe('the device, per Table 7', () => {
  const device = (...names: string[]) => check([service(state({ q: [qualifier(names)] }))]);

  it('QCWithQSCD says yes even if the certificate does not', () => {
    const result = check([service(state({ q: [qualifier(['QCWithQSCD'])] }))], facts({ onQualifiedDevice: false }));
    expect(result.onQualifiedDevice).toBe(true);
  });

  it('QCNoQSCD says no even if the certificate does', () => {
    expect(device('QCNoQSCD').onQualifiedDevice).toBe(false);
  });

  it('a managed-on-behalf device counts', () => {
    expect(device('QCQSCDManagedOnBehalf').onQualifiedDevice).toBe(true);
  });

  it('contradictions leave it undetermined', () => {
    expect(device('QCWithQSCD', 'QCNoQSCD').onQualifiedDevice).toBeNull();
    expect(device('QCQSCDStatusAsInCert', 'QCWithQSCD').onQualifiedDevice).toBeNull();
    expect(device('QCWithSSCD').onQualifiedDevice).toBeNull();
  });
});

describe('a seal', () => {
  const seals = service(state({ a: ['ForeSeals'] }));

  it('is qualified as a seal only when its type says seal', () => {
    expect(check([seals], facts({ types: [2] })).result).toBe('qualified');
    expect(check([seals], facts({ types: [] })).result).toBe('not-qualified');
  });

  it('is not a signature certificate on a seals-only service', () => {
    expect(check([seals], facts({ types: [1] })).result).toBe('not-qualified');
  });
});

describe('whether this is the right entry at all', () => {
  it('needs the issuer\'s country to be the list\'s', () => {
    expect(check([service()], facts({ issuerCountry: 'CZ' })).result).toBe('cannot-check');
  });

  it('writes Greece as the list does', () => {
    const result = checkAgainstList([service()], 'EL', facts({ issuerCountry: 'GR' }), SIGNED);
    expect(result.result).toBe('qualified');
  });

  it('needs the issuer\'s organisation to be the listed provider', () => {
    expect(check([service()], facts({ issuerOrganization: 'Somebody Else' })).result).toBe('cannot-check');
  });

  it('matches that name whatever the accents and case', () => {
    expect(check([service()], facts({ issuerOrganization: 'NARODNA  AGENTÚRA' })).result).toBe('qualified');
  });

  it('claims nothing from an empty list of services', () => {
    expect(check([]).result).toBe('cannot-check');
  });

  it('reports a service not yet on the list then', () => {
    const later = service(state({ t: '2027-01-01T00:00:00Z' }));
    expect(check([later]).result).toBe('not-qualified');
  });
});
