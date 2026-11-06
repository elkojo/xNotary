/**
 * What a trusted list says about a service, read at build time and shipped compactly.
 *
 * Only what ETSI TS 119 615 asks of a list: a service's status over time, what it is for,
 * the qualifiers it sets and which certificates those apply to, and the provider's names.
 * Field names are short because this is written once per listed certificate and served to
 * every reader who looks one up.
 */
export interface Criteria {
  /** How the parts combine: `all`, `atLeastOne` or `none`. */
  readonly a: string;
  /** Sets of policy identifiers, each of which a certificate must carry in full. */
  readonly p?: readonly (readonly string[])[];
  /** Sets of key usage bits, as `[name, value]`. */
  readonly k?: readonly (readonly (readonly [string, boolean])[])[];
  readonly n?: readonly Criteria[];
  /** It holds a criterion this app does not evaluate. */
  readonly x?: true;
}

export interface QualificationElement {
  /** The last part of each qualifier's URI: `QCForESig`, `QCWithQSCD`, … */
  readonly q: readonly string[];
  readonly c: Criteria;
}

export interface ServiceState {
  /** The last part of the status URI: `granted`, `withdrawn`, … */
  readonly s: string;
  /** When it took effect. */
  readonly t: string;
  /** The last part of each additional-information URI: `ForeSignatures`, … */
  readonly a?: readonly string[];
  readonly q?: readonly QualificationElement[];
}

export interface ListedService {
  /** The provider's names, as the list gives them. */
  readonly n: readonly string[];
  /** Its states, newest first. */
  readonly h: readonly ServiceState[];
}

const childrenNamed = (parent: Element, name: string): Element[] => {
  const found: Element[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1 && (child as Element).localName === name) found.push(child as Element);
  }
  return found;
};

const childNamed = (parent: Element, name: string): Element | undefined => childrenNamed(parent, name)[0];

const descendantsNamed = (parent: Element, name: string): Element[] => {
  const found: Element[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    if ((child as Element).localName === name) found.push(child as Element);
    found.push(...descendantsNamed(child as Element, name));
  }
  return found;
};

const text = (element: Element | undefined): string => element?.textContent?.trim() ?? '';
const tail = (uri: string): string => uri.split('/').pop() ?? uri;

/** A policy identifier, written as `urn:oid:1.2.3` or bare. */
const oidOf = (identifier: Element): string => text(identifier).replace(/^urn:oid:/i, '');

function readCriteria(list: Element): Criteria {
  const criteria: { a: string; p?: string[][]; k?: Array<Array<[string, boolean]>>; n?: Criteria[]; x?: true } = {
    a: list.getAttribute('assert') ?? 'all',
  };
  for (let child = list.firstChild; child; child = child.nextSibling) {
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    switch (element.localName) {
      case 'PolicySet':
        (criteria.p ??= []).push(descendantsNamed(element, 'Identifier').map(oidOf));
        break;
      case 'KeyUsage':
        (criteria.k ??= []).push(
          childrenNamed(element, 'KeyUsageBit').map((bit): [string, boolean] => [bit.getAttribute('name') ?? '', text(bit) === 'true']),
        );
        break;
      case 'CriteriaList':
        (criteria.n ??= []).push(readCriteria(element));
        break;
      case 'Description':
        break;
      default:
        criteria.x = true;
    }
  }
  return criteria;
}

function readState(element: Element): ServiceState {
  const extensions = childNamed(element, 'ServiceInformationExtensions');
  const additional = extensions ? descendantsNamed(extensions, 'AdditionalServiceInformation').map((info) => tail(text(childNamed(info, 'URI')))) : [];
  const elements = extensions ? descendantsNamed(extensions, 'QualificationElement') : [];
  const q = elements.map((qualification): QualificationElement => {
    const list = childNamed(qualification, 'CriteriaList');
    return {
      q: descendantsNamed(qualification, 'Qualifier').map((qualifier) => tail(qualifier.getAttribute('uri') ?? '')),
      c: list ? readCriteria(list) : { a: 'all', x: true },
    };
  });
  return {
    s: tail(text(childNamed(element, 'ServiceStatus'))),
    t: text(childNamed(element, 'StatusStartingTime')),
    ...(additional.length ? { a: additional } : {}),
    ...(q.length ? { q } : {}),
  };
}

/** The service was another type from this moment: not any status the rules know. */
export const RETYPED = 'retyped';

const KINDS: ReadonlyArray<readonly ['ca' | 'tsa' | 'ocsp', RegExp]> = [
  ['ca', /\/TrstSvc\/Svctype\/CA\/QC$/],
  ['tsa', /\/TrstSvc\/Svctype\/TSA\/QTST$/],
  ['ocsp', /\/TrstSvc\/Svctype\/Certstatus\/OCSP\/QC$/],
];

export interface ReadService {
  /** Base64 of each certificate that identifies the service. */
  readonly certificates: readonly string[];
  readonly service: ListedService;
  /** Where the service says it publishes things: its OCSP address, its revocation lists. */
  readonly supplyPoints: readonly string[];
  /** A certificate-issuing service, or a time authority. */
  readonly kind: 'ca' | 'tsa' | 'ocsp';
}

/**
 * Every qualified certificate-issuing service, time authority and OCSP responder in a list.
 *
 * The EU's lists name the type with ETSI's URI; Switzerland's and Ukraine's with their own
 * namespaces, so it is matched by its path.
 */
export function readQualifiedServices(list: Element): ReadService[] {
  const found: ReadService[] = [];
  for (const provider of descendantsNamed(list, 'TrustServiceProvider')) {
    const information = childNamed(provider, 'TSPInformation');
    const names = information
      ? [...descendantsNamed(childNamed(information, 'TSPName') ?? information, 'Name'), ...(childNamed(information, 'TSPTradeName') ? descendantsNamed(childNamed(information, 'TSPTradeName')!, 'Name') : [])].map(text)
      : [];

    for (const entry of descendantsNamed(provider, 'TSPService')) {
      const current = childNamed(entry, 'ServiceInformation');
      if (!current) continue;

      // Current and historical: a service may have been re-keyed or retyped, and a signature made
      // years ago still needs what it was then. Only the states of the kind in question count.
      const history = childNamed(entry, 'ServiceHistory');
      const instances = [current, ...(history ? childrenNamed(history, 'ServiceHistoryInstance') : [])];
      for (const [kind, pattern] of KINDS) {
        const matching = instances.filter((instance) => pattern.test(text(childNamed(instance, 'ServiceTypeIdentifier'))));
        if (matching.length === 0) continue;
        found.push({
          certificates: [
            ...new Set(
              matching.flatMap((instance) => {
                const identity = childNamed(instance, 'ServiceDigitalIdentity');
                return identity ? descendantsNamed(identity, 'X509Certificate').map((element) => text(element).replace(/\s/g, '')) : [];
              }),
            ),
          ],
          // Every state, in order: one of another type is where this kind stopped, and dropping it
          // would leave the last matching state applying forever.
          service: {
            n: [...new Set(names)],
            h: instances.map((instance) => (matching.includes(instance) ? readState(instance) : { s: RETYPED, t: text(childNamed(instance, 'StatusStartingTime')) })),
          },
          supplyPoints: descendantsNamed(current, 'ServiceSupplyPoint').map(text),
          kind,
        });
      }
    }
  }
  return found;
}
