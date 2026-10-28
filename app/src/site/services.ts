import { NAV } from '../nav';
import { NAV as XSIGNATURE_NAV } from '../../../xsignature/app/src/nav';
import { NAV as XCONVERT_NAV } from '../../../xconvert/app/src/nav';

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
export type ServiceId = 'xnotary' | 'xsignature' | 'xconvert';

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
  /** Its third-party notices, relative to `href`. The front page's index lists them all. */
  readonly notices: string;
  /** The same in Czech (lang.svelte.ts). */
  readonly cs: { readonly tagline: string; readonly description: string };
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
    description: 'Prove an exact file existed by a given Bitcoin block, and record who signed it.',
    tabs: NAV,
    notices: 'THIRD-PARTY.txt',
    cs: {
      tagline: 'Časové razítko dokumentu v Bitcoinu a doklad o tom, kdo ho podepsal.',
      description: 'Doložte, že přesný soubor existoval k danému bloku Bitcoinu, a zaznamenejte, kdo ho podepsal.',
    },
  },
  {
    id: 'xsignature',
    name: 'xSignature',
    mark: 'xS',
    href: '/xsignature/',
    external: false,
    home: 'signature',
    tagline: 'Make a signature image, sign a PDF with your certificate and an independent timestamp.',
    description:
      'Make a signature, put it on a PDF. Sign with your own certificate to produce an advanced ' +
      'electronic signature with an independent timestamp.',
    tabs: XSIGNATURE_NAV,
    notices: 'THIRD-PARTY.md',
    cs: {
      tagline: 'Obrázek podpisu a podpis PDF vlastním certifikátem s nezávislým časovým razítkem.',
      description:
        'Vytvořte podpis a dejte ho na PDF. Podepište vlastním certifikátem — vznikne zaručený ' +
        'elektronický podpis s nezávislým časovým razítkem.',
    },
  },
  {
    id: 'xconvert',
    name: 'xConvert',
    mark: 'xC',
    href: '/xconvert/',
    external: false,
    home: 'convert',
    tagline: 'Convert a document to PDF/A, DOCX, ODT and more.',
    description:
      'Convert a document between DOCX, ODT, HTML, Markdown and more — or to an archival PDF/A, ' +
      'ready to sign or timestamp.',
    tabs: XCONVERT_NAV,
    notices: 'THIRD-PARTY.txt',
    cs: {
      tagline: 'Převod dokumentu do PDF/A, DOCX, ODT a dalších formátů.',
      description:
        'Převádějte dokumenty mezi DOCX, ODT, HTML, Markdownem a dalšími formáty — nebo do ' +
        'archivního PDF/A, připraveného k podpisu či časovému razítku.',
    },
  },
];

/** "Start from your situation": the questions that lead to a task (hub/Situations.svelte). */
export const SITUATIONS_HREF = '/situations/';

/** What people come to do, each pointing at the screen that does it. */
export const TASKS: ReadonlyArray<{
  readonly service: ServiceId;
  readonly page: string;
  readonly title: string;
  readonly description: string;
  readonly cs: { readonly title: string; readonly description: string };
}> = [
  {
    service: 'xconvert', page: 'convert', title: 'Convert a document', description: 'To an archival PDF/A, DOCX, ODT and more.',
    cs: { title: 'Převést dokument', description: 'Do archivního PDF/A, DOCX, ODT a dalších formátů.' },
  },
  {
    service: 'xnotary', page: 'notarize', title: 'Prove a file existed', description: 'A Bitcoin-anchored timestamp of the exact file.',
    cs: { title: 'Doložit, že soubor existoval', description: 'Časové razítko přesného souboru ukotvené v Bitcoinu.' },
  },
  {
    service: 'xsignature', page: 'document', title: 'Sign a PDF', description: 'Place your signature, sign with your certificate and an independent timestamp.',
    cs: { title: 'Podepsat PDF', description: 'Umístěte podpis, podepište certifikátem a nezávislým časovým razítkem.' },
  },
  {
    service: 'xnotary', page: 'attest', title: 'Record who signed', description: 'Certify the signers of a file that was signed elsewhere.',
    cs: { title: 'Zaznamenat, kdo podepsal', description: 'Doložte podepisující u souboru podepsaného jinde.' },
  },
  {
    service: 'xsignature', page: 'signature', title: 'Make a signature image', description: 'Type or draw it; export PNG or SVG.',
    cs: { title: 'Vytvořit obrázek podpisu', description: 'Napište nebo nakreslete; uložte jako PNG nebo SVG.' },
  },
  {
    service: 'xnotary', page: 'verify', title: 'Verify an xNotary proof', description: 'Match a document to its xNotary certificate.',
    cs: { title: 'Ověřit důkaz xNotary', description: 'Porovnejte dokument s jeho certifikátem xNotary.' },
  },
  {
    service: 'xsignature', page: 'check', title: 'Check a signed PDF', description: 'See what a signed or timestamped PDF claims.',
    cs: { title: 'Zkontrolovat podepsané PDF', description: 'Co tvrdí podepsané PDF, nebo PDF s časovým razítkem.' },
  },
];

/** Czech for the services' tab labels, where the site's own pages show them (the front page). */
export const TABS_CS: Readonly<Record<string, string>> = {
  Timestamp: 'Časové razítko',
  'Certify signers': 'Doložit podepisující',
  'Verify proof': 'Ověřit důkaz',
  'My certificates': 'Moje certifikáty',
  Help: 'Nápověda',
  'Signature image': 'Obrázek podpisu',
  'Sign a document': 'Podepsat dokument',
  'Check a PDF': 'Zkontrolovat PDF',
  Convert: 'Převést',
};

export const service = (id: ServiceId): Service => SERVICES.find((s) => s.id === id)!;

/** Address of one screen of a service. Every route in the family is a hash route. */
export const pageHref = (id: ServiceId, page: string): string => `${service(id).href}#/${page}`;
