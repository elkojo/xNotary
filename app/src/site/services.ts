import { NAV } from '../nav';
import { NAV as XSIGNATURE_NAV } from '../../../xsignature/app/src/nav';

/**
 * The xNotary.digital family, as the shared bar, the task menu and the front
 * page see it. One entry per service, so the switcher, the "I want to…" menu
 * and the front-page cards cannot drift apart: they all read this.
 *
 * `href` is where the service lives and `home` its first screen. A service
 * that is not on this origin is `external` and is linked out with a ↗ rather
 * than pretending to be part of the site. Each service's tabs are its own
 * routing table, imported, so a renamed screen cannot leave a stale label here.
 */
export type ServiceId = 'xnotary' | 'xsignature';

export interface Service {
  readonly id: ServiceId;
  readonly name: string;
  readonly mark: string;
  readonly href: string;
  readonly external: boolean;
  readonly home: string;
  readonly tagline: string;
  readonly description: string;
  readonly tabs: ReadonlyArray<{ readonly id: string; readonly label: string }>;
}

export const SERVICES: readonly Service[] = [
  {
    id: 'xnotary',
    name: 'xNotary',
    mark: 'xN',
    href: '/xnotary/',
    external: false,
    home: 'home',
    tagline: 'Timestamp a document in Bitcoin and certify who signed it.',
    description:
      'Prove that an exact file existed no later than a particular Bitcoin block, and record who ' +
      'put their name to it. Only a 32-byte fingerprint is ever sent.',
    tabs: NAV,
  },
  {
    id: 'xsignature',
    name: 'xSignature',
    mark: 'xS',
    href: '/xsignature/',
    external: false,
    home: 'signature',
    tagline: 'Make a signature image, sign a PDF, check a signed PDF.',
    description:
      'Type or draw a signature and export a PNG or SVG, put it on a PDF — optionally with your ' +
      'own certificate and a timestamp — and read a PDF back to see what it claims.',
    tabs: XSIGNATURE_NAV,
  },
];

/** What people come to do, each pointing at the screen that does it. */
export const TASKS: ReadonlyArray<{
  readonly service: ServiceId;
  readonly page: string;
  readonly title: string;
  readonly description: string;
}> = [
  { service: 'xnotary', page: 'notarize', title: 'Prove a file existed', description: 'A Bitcoin-anchored timestamp of the exact file.' },
  { service: 'xsignature', page: 'document', title: 'Sign a PDF', description: 'Place your signature, optionally with your own certificate.' },
  { service: 'xnotary', page: 'attest', title: 'Record who signed', description: 'Certify the signers of a file that was signed elsewhere.' },
  { service: 'xsignature', page: 'signature', title: 'Make a signature image', description: 'Type or draw it; export PNG or SVG.' },
  { service: 'xnotary', page: 'verify', title: 'Verify an xNotary proof', description: 'Match a document to its xNotary certificate.' },
  { service: 'xsignature', page: 'check', title: 'Check a signed PDF', description: 'See what a signed or timestamped PDF claims.' },
];

export const service = (id: ServiceId): Service => SERVICES.find((s) => s.id === id)!;

/** Address of one screen of a service. Every route in the family is a hash route. */
export const pageHref = (id: ServiceId, page: string): string => `${service(id).href}#/${page}`;
