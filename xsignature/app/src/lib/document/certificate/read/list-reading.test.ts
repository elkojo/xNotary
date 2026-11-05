import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { listSignature, parseList } from '../../../../../scripts/list-signature';
import { C14N_EXCLUSIVE, canonicalize } from '../../verify/asic/c14n';
import { makeSigner, type Signer } from '../../verify/asic/fixtures.test-helper';
import { readQualifiedServices } from './trusted-list';

const T = 'http://uri.etsi.org/02231/v2#';
const DS = 'http://www.w3.org/2000/09/xmldsig#';
const ENV = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const STATUS = 'http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/';
const SVC = 'http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/';

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const sha = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer));

const service = (type: string) => `<TSPService><ServiceInformation>
  <ServiceTypeIdentifier>http://uri.etsi.org/TrstSvc/Svctype/${type}</ServiceTypeIdentifier>
  <ServiceDigitalIdentity><DigitalId><X509Certificate> QUJD
    REVG </X509Certificate></DigitalId></ServiceDigitalIdentity>
  <ServiceStatus>${STATUS}granted</ServiceStatus>
  <StatusStartingTime>2021-09-20T08:00:00Z</StatusStartingTime>
  <ServiceInformationExtensions>
    <Extension Critical="false"><AdditionalServiceInformation><URI>${SVC}ForeSignatures</URI></AdditionalServiceInformation></Extension>
    <Extension Critical="true"><Qualifications xmlns="http://uri.etsi.org/TrstSvc/SvcInfoExt/eSigDir-1999-93-EC-TrustedList/#">
      <QualificationElement>
        <Qualifiers><Qualifier uri="${SVC}QCWithQSCD"/></Qualifiers>
        <CriteriaList assert="atLeastOne">
          <PolicySet><PolicyIdentifier xmlns="http://uri.etsi.org/01903/v1.3.2#"><Identifier>urn:oid:1.2.3.4</Identifier></PolicyIdentifier></PolicySet>
          <KeyUsage><KeyUsageBit name="nonRepudiation">true</KeyUsageBit></KeyUsage>
          <CertSubjectDNAttribute><AttributeOID><Identifier>2.5.4.10</Identifier></AttributeOID></CertSubjectDNAttribute>
        </CriteriaList>
      </QualificationElement>
    </Qualifications></Extension>
  </ServiceInformationExtensions>
</ServiceInformation>
<ServiceHistory><ServiceHistoryInstance>
  <ServiceStatus>${STATUS}undersupervision</ServiceStatus>
  <StatusStartingTime>2019-01-01T00:00:00Z</StatusStartingTime>
</ServiceHistoryInstance></ServiceHistory></TSPService>`;

const LIST_BODY = `<SchemeInformation><TSLSequenceNumber>7</TSLSequenceNumber></SchemeInformation><TrustServiceProviderList><TrustServiceProvider>
  <TSPInformation><TSPName><Name xml:lang="sk">Národná agentúra</Name><Name xml:lang="en">National Agency</Name></TSPName>
  <TSPTradeName><Name xml:lang="en">NASES</Name></TSPTradeName></TSPInformation>
  <TSPServices>${service('CA/QC')}${service('TSA/QTST')}</TSPServices>
</TrustServiceProvider></TrustServiceProviderList>`;

describe('reading a list', () => {
  const [read, ...others] = readQualifiedServices(parseList(`<TrustServiceStatusList xmlns="${T}">${LIST_BODY}</TrustServiceStatusList>`));

  it('keeps qualified certificate services and no others', () => {
    expect(others).toEqual([]);
  });

  it('keeps the certificate, without its whitespace', () => {
    expect(read.certificates).toEqual(['QUJDREVG']);
  });

  it('keeps the provider\'s names, trade name included', () => {
    expect(read.service.n).toEqual(['Národná agentúra', 'National Agency', 'NASES']);
  });

  it('keeps the states, newest first', () => {
    expect(read.service.h.map((state) => [state.s, state.t])).toEqual([
      ['granted', '2021-09-20T08:00:00Z'],
      ['undersupervision', '2019-01-01T00:00:00Z'],
    ]);
  });

  it('keeps what it is for and its qualifiers', () => {
    expect(read.service.h[0].a).toEqual(['ForeSignatures']);
    expect(read.service.h[0].q?.[0].q).toEqual(['QCWithQSCD']);
  });

  it('reads the criteria it can, and marks the one it cannot', () => {
    const criteria = read.service.h[0].q?.[0].c;
    expect(criteria?.a).toBe('atLeastOne');
    expect(criteria?.p).toEqual([['1.2.3.4']]);
    expect(criteria?.k).toEqual([[['nonRepudiation', true]]]);
    expect(criteria?.x).toBe(true);
  });
});

describe('a list\'s signature', () => {
  /** An enveloped signature, as trusted lists have. */
  const signedList = async (signer: Signer, body = LIST_BODY): Promise<string> => {
    const open = `<TrustServiceStatusList xmlns="${T}" xmlns:ds="${DS}">`;
    const unsigned = `${open}${body}</TrustServiceStatusList>`;
    const documentDigest = base64(await sha(canonicalize(parseList(unsigned), C14N_EXCLUSIVE)));
    const signedInfo = `<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="${C14N_EXCLUSIVE}"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference URI=""><ds:Transforms><ds:Transform Algorithm="${ENV}"/><ds:Transform Algorithm="${C14N_EXCLUSIVE}"/></ds:Transforms><ds:DigestMethod Algorithm="${SHA256}"/><ds:DigestValue>${documentDigest}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;
    const wrap = (value: string) =>
      `${open}${body}<ds:Signature>${signedInfo}<ds:SignatureValue>${value}</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${base64(signer.der)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></ds:Signature></TrustServiceStatusList>`;
    const element = parseList(wrap('')).getElementsByTagNameNS(DS, 'SignedInfo')[0] as unknown as Element;
    const value = new Uint8Array(await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, signer.privateKey, canonicalize(element, C14N_EXCLUSIVE).slice().buffer as ArrayBuffer));
    return wrap(base64(value));
  };
  const print = (signer: Signer) => createHash('sha256').update(signer.der).digest('hex');

  it('holds when a good signature comes from an expected certificate', async () => {
    const signer = await makeSigner('List Operator');
    expect(await listSignature(await signedList(signer), new Set([print(signer)]))).toEqual({ ok: true, why: '' });
  });

  it('fails when the certificate is not one it was told to expect', async () => {
    const signer = await makeSigner('List Operator');
    const result = await listSignature(await signedList(signer), new Set(['not-this-one']));
    expect(result.ok).toBe(false);
    expect(result.why).toMatch(/not expected/);
  });

  it('fails when the list was edited after signing', async () => {
    const signer = await makeSigner('List Operator');
    const edited = (await signedList(signer)).replace('<TSLSequenceNumber>7', '<TSLSequenceNumber>8');
    const result = await listSignature(edited, new Set([print(signer)]));
    expect(result).toEqual({ ok: false, why: 'the document does not match' });
  });

  it('fails when the signature value is damaged', async () => {
    const signer = await makeSigner('List Operator');
    const damaged = (await signedList(signer)).replace(/<ds:SignatureValue>(.)/, (_m, first) => `<ds:SignatureValue>${first === 'A' ? 'B' : 'A'}`);
    const result = await listSignature(damaged, new Set([print(signer)]));
    expect(result.why).toMatch(/signature value/);
  });

  it('fails when it is not signed', async () => {
    const result = await listSignature(`<TrustServiceStatusList xmlns="${T}">${LIST_BODY}</TrustServiceStatusList>`, new Set(['x']));
    expect(result).toEqual({ ok: false, why: 'not signed' });
  });
});
