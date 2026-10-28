/**
 * "Start from your situation": a few questions, then the right tool — or, as often, what to
 * ask somebody first. The content of /situations/ (hub/Situations.svelte) and of the front
 * page's cards, kept here as data so that what it says can be tested.
 *
 * It names limits rather than solving them. Where a step needs an authority, a notary or a
 * certificate this site cannot provide, the outcome says so; it never suggests that a tool
 * here stands in for an official act (see "Notarization is the product's name, never a legal
 * claim" in CLAUDE.md).
 *
 * Every outcome carries a traffic light — online, with help, in person — and every outcome
 * that rests on a rule of law names its sources and the day they were checked. Sources are
 * official texts only (OFFICIAL_HOSTS). Rules change: re-check them, and the date, before
 * relying on an old one.
 *
 * The Czech route for an officially verified signature (§ 6(2) of Act 12/2020 Coll.) was held
 * back until 2026-10-28, when the owner released it with its sources and its exception (§ 6(3))
 * on screen. It is the one route here that is specific to one country, and it is shown only
 * when the document goes to Czechia.
 */
import type { Lang } from './lang.svelte';
import type { ServiceId } from './services';
import { JOURNEYS_CS, LIGHTS_CS, NODES_CS, SOURCES_CS, type OutcomeCs, type QuestionCs } from './situations.cs';

export type NodeId = string;
export type JourneyId = 'official' | 'sign' | 'poa' | 'proof' | 'check' | 'copy' | 'company' | 'property' | 'abroad';

/** How the next step is done: by the reader online, with somebody else's step, or in person. */
export type Light = 'online' | 'assisted' | 'in-person';

export const LIGHTS: Readonly<Record<Light, { readonly label: string; readonly line: string }>> = {
  online: { label: 'Online', line: 'Can be done online, when the conditions below are met.' },
  assisted: { label: 'With help', line: 'Needs a step by someone else: the recipient, a provider or a professional.' },
  'in-person': { label: 'In person', line: 'Needs a visit to an office or a notary.' },
};

export interface Source {
  readonly label: string;
  readonly url: string;
}

/** The only places a source may come from: the law and the authorities that apply it. */
export const OFFICIAL_HOSTS = [
  'www.zakonyprolidi.cz',
  'www.dia.gov.cz',
  'portal.gov.cz',
  'eur-lex.europa.eu',
  'eidas.ec.europa.eu',
  'www.hcch.net',
] as const;

export interface Journey {
  readonly id: JourneyId;
  readonly title: string;
  readonly description: string;
  /** The stepper's names, the last always the outcome. */
  readonly stages: readonly string[];
  readonly first: NodeId;
}

export interface Answer {
  readonly label: string;
  readonly hint?: string;
  readonly next: NodeId;
}

export interface Question {
  readonly kind: 'question';
  readonly journey: JourneyId;
  readonly stage: number;
  readonly title: string;
  readonly lead: string;
  readonly answers: readonly Answer[];
}

export interface Outcome {
  readonly kind: 'outcome';
  readonly journey: JourneyId;
  readonly light: Light;
  readonly title: string;
  readonly lead: string;
  readonly steps: readonly string[];
  /** The tools that do the next step, by service and page. */
  readonly go: readonly { readonly service: ServiceId; readonly page: string; readonly label: string }[];
  /** The rules this rests on, and the day they were read. Required wherever a rule of law is cited. */
  readonly sources?: readonly Source[];
  readonly checked?: string;
}

export type SituationNode = Question | Outcome;

// --- Sources -------------------------------------------------------------------------------

const S = {
  dia: {
    label: 'DIA: replacing an officially verified signature (§ 6(2), Act 12/2020 Coll.)',
    url: 'https://www.dia.gov.cz/cs/legislativa/eidas-sluzby-vytvarejici-duveru-a-elektronicka-identifikace/informace-pro-uzivatele/pravo-na-nahrazeni-uredne-overeneho-podpisu-dle-ss-6-odst-2-zakona-c-12-2020-sb',
  },
  act12: { label: 'Act 12/2020 Coll., § 6', url: 'https://www.zakonyprolidi.cz/cs/2020-12' },
  act297: { label: 'Act 297/2016 Coll., § 6 — the recognised electronic signature', url: 'https://www.zakonyprolidi.cz/cs/2016-297' },
  portal: {
    label: 'Portál veřejné správy: registering a qualified certificate in the population register',
    url: 'https://portal.gov.cz/rozcestniky/zapis-kvalifikovaneho-certifikatu-do-registru-obyvatel-RZC-113',
  },
  trustList: { label: 'EU trust list: qualified trust service providers', url: 'https://eidas.ec.europa.eu/efda/trust-services/browse/eidas/tls' },
  notarial: { label: 'Notarial Code, Act 358/1992 Coll., §§ 64a and 74a', url: 'https://www.zakonyprolidi.cz/cs/1992-358' },
  civil: { label: 'Civil Code, Act 89/2012 Coll., § 441(2)', url: 'https://www.zakonyprolidi.cz/cs/2012-89' },
  copies: { label: 'Act 21/2006 Coll., on certifying copies and signatures', url: 'https://www.zakonyprolidi.cz/cs/2006-21' },
  conversion: { label: 'Act 300/2008 Coll., authorised conversion', url: 'https://www.zakonyprolidi.cz/cs/2008-300' },
  eidas: { label: 'eIDAS Regulation (EU) 910/2014, art. 25', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014R0910-20240520' },
  apostille: { label: 'Hague Apostille Convention: member countries', url: 'https://www.hcch.net/en/instruments/conventions/status-table/?cid=41' },
} satisfies Record<string, Source>;

const CHECKED = '2026-10-28';

// --- Journeys ------------------------------------------------------------------------------

export const JOURNEYS: readonly Journey[] = [
  {
    id: 'official',
    title: 'Get a signature officially verified',
    description: 'Somebody asked for a certified or officially verified signature.',
    stages: ['Where it goes', 'What was asked', 'Your certificate', 'Next step'],
    first: 'official-where',
  },
  {
    id: 'sign',
    title: 'Sign a document',
    description: 'With your certificate, or with a picture of your signature.',
    stages: ['Kind of signature', 'Your certificate', 'Next step'],
    first: 'sign-kind',
  },
  {
    id: 'poa',
    title: 'Give a power of attorney',
    description: 'Let someone act for you — privately, before an authority or at a notary.',
    stages: ['What it is for', 'Next step'],
    first: 'poa-what',
  },
  {
    id: 'proof',
    title: 'Prove a file existed',
    description: 'A record of this exact file at this time, without sending it anywhere.',
    stages: ['What you need', 'Next step'],
    first: 'proof-kind',
  },
  {
    id: 'check',
    title: 'Check a document I received',
    description: 'What a signed PDF claims, or whether a file matches its proof.',
    stages: ['What you received', 'Next step'],
    first: 'check-kind',
  },
  {
    id: 'copy',
    title: 'Get a certified copy',
    description: 'A copy an authority accepts as matching the original.',
    stages: ['What you have', 'Next step'],
    first: 'copy-what',
  },
  {
    id: 'company',
    title: 'Set up or change a company',
    description: 'Founding documents, and papers for the commercial register.',
    stages: ['What you need', 'Next step'],
    first: 'company-what',
  },
  {
    id: 'property',
    title: 'Buy or sell property',
    description: 'A contract for the land registry, or papers for your lawyer.',
    stages: ['What you sign', 'Next step'],
    first: 'property-what',
  },
  {
    id: 'abroad',
    title: 'Use a document abroad',
    description: 'A signature, a declaration or a copy for another country.',
    stages: ['Where it goes', 'What was asked', 'Next step'],
    first: 'abroad-where',
  },
];

// --- The questions and outcomes ------------------------------------------------------------

/** The same steps wherever the Czech route is reached from. */
const CZ_ROUTE_STEPS = [
  'Check the exception first. The route does not apply to a power of attorney for an act that needs a public deed, such as a notarial deed (§ 6(3)), and another law may require a particular form.',
  'Register your qualified certificate in the population register through Portál občana (Profile → Certificates). Only its public part goes in, never the key. Some certificates carry identification data that makes this unnecessary: your provider can say.',
  'Sign the document with that certificate: with a key file in Sign a PDF here, or with a card or token in its own software. In Czech law, an advanced signature based on a qualified certificate is a recognised electronic signature.',
  'Send it the way the authority asks. The authority checks against the register that the certificate is yours; this site does not, and cannot.',
] as const;

export const NODES: Readonly<Record<NodeId, SituationNode>> = {
  // --- Officially verified -------------------------------------------------------------
  'official-where': {
    kind: 'question',
    journey: 'official',
    stage: 0,
    title: 'Where will the document be used?',
    lead: 'The rules of the country it goes to apply — not the rules where you are now.',
    answers: [
      { label: 'Czechia (CZ)', next: 'official-ask' },
      { label: 'Another EU country', next: 'official-eu' },
      { label: 'Outside the EU', next: 'abroad-ask-world' },
    ],
  },
  'official-ask': {
    kind: 'question',
    journey: 'official',
    stage: 1,
    title: 'What has the recipient asked for?',
    lead: 'A signed PDF, an officially verified signature and a notarial deed are three different things. If you are not sure, choose the last answer.',
    answers: [
      {
        label: 'An officially verified signature',
        hint: 'Required by a law — in Czech, úředně ověřený podpis.',
        next: 'official-cert',
      },
      { label: 'A power of attorney with a verified signature', next: 'poa-what' },
      { label: 'An electronic signature on a PDF', hint: 'A signed document, with no official certification.', next: 'sign-kind' },
      { label: 'A notarial deed', hint: 'A document a notary has to draw up.', next: 'official-deed' },
      { label: 'I am not sure', next: 'official-unsure' },
    ],
  },
  'official-cert': {
    kind: 'question',
    journey: 'official',
    stage: 2,
    title: 'Do you have a qualified certificate for electronic signatures?',
    lead: 'A qualified trust service provider issues one after checking who you are. A certificate from an employer or an internal system does not count.',
    answers: [
      { label: 'Yes', hint: 'As a key file (.p12, .pfx), or on a card or token.', next: 'official-cz' },
      { label: 'No, or I am not sure', next: 'official-nocert' },
    ],
  },
  'official-cz': {
    kind: 'outcome',
    journey: 'official',
    light: 'online',
    title: 'You may not need a notary at all',
    lead: 'Where a law requires an officially verified signature, Czech law accepts a recognised electronic signature instead — if the authority can confirm through the population register that the qualified certificate is yours (§ 6(2) of Act 12/2020 Coll.).',
    steps: CZ_ROUTE_STEPS,
    go: [{ service: 'xsignature', page: 'document', label: 'Sign a PDF' }],
    sources: [S.dia, S.act12, S.portal, S.act297],
    checked: CHECKED,
  },
  'official-nocert': {
    kind: 'outcome',
    journey: 'official',
    light: 'assisted',
    title: 'First, get a qualified certificate',
    lead: 'It is the one step the online route cannot skip, and a qualified trust service provider does it, not this site.',
    steps: [
      'Choose a provider listed for Czechia on the EU trust list.',
      'It checks who you are — at a branch, or online with some providers — and issues the certificate as a key file or on a card.',
      'Then follow the route: register the certificate in Portál občana, sign with it, and send the document as the authority asks.',
    ],
    go: [],
    sources: [S.trustList, S.dia],
    checked: CHECKED,
  },
  'official-eu': {
    kind: 'outcome',
    journey: 'official',
    light: 'assisted',
    title: 'Ask the recipient what they accept',
    lead: 'Each country decides how a signature is officially verified. A qualified electronic signature has the effect of a handwritten one across the EU, but it is not an officially verified signature by itself, anywhere.',
    steps: [
      'Ask whether they accept a qualified electronic signature, or their own country’s electronic substitute for a verified one.',
      'If not: a notary, at home or in their country. Some act remotely, by video.',
      'A signature made here from a key file is advanced, not qualified: check that the recipient accepts that level.',
    ],
    go: [],
    sources: [S.eidas],
    checked: CHECKED,
  },
  'official-deed': {
    kind: 'outcome',
    journey: 'official',
    light: 'in-person',
    title: 'This needs a notary',
    lead: 'A notarial deed is drawn up by a notary. No signature tool, here or anywhere else, makes one.',
    steps: [
      'Ask the recipient which country the deed must come from.',
      'Ask a notary there whether you can take part by video. In Czechia the Notarial Code allows it with an electronic identity at the high level (§ 64a), where the notary offers it.',
    ],
    go: [],
    sources: [S.notarial],
    checked: CHECKED,
  },
  'official-unsure': {
    kind: 'outcome',
    journey: 'official',
    light: 'assisted',
    title: 'First, find out what is required',
    lead: 'Signing a PDF, having a signature officially verified and having a deed drawn up are different procedures. Doing the wrong one costs more than asking.',
    steps: [
      'Ask the recipient: do you accept an electronic signature, or do you need an officially verified signature or a notarial deed?',
      'If an officially verified signature: ask which law requires it. The online route applies only where a law does.',
      'Come back with the answer and start again.',
    ],
    go: [],
  },

  // --- Sign ----------------------------------------------------------------------------
  'sign-kind': {
    kind: 'question',
    journey: 'sign',
    stage: 0,
    title: 'What kind of signature does the recipient expect?',
    lead: 'A picture of a signature and a signature made with a certificate look alike on the page. They are not the same thing.',
    answers: [
      {
        label: 'A signature made with a certificate',
        hint: 'A digital signature: it shows who holds the key, and that the file has not changed since.',
        next: 'sign-setup',
      },
      { label: 'Just a picture of my signature', hint: 'Where a visible mark is enough: forms, letters.', next: 'sign-picture' },
      { label: 'An officially verified signature', hint: 'Certified or legalised.', next: 'official-where' },
    ],
  },
  'sign-setup': {
    kind: 'question',
    journey: 'sign',
    stage: 1,
    title: 'Do you have a certificate to sign with?',
    lead: 'A certificate authority issues it after checking who you are. It is what ties a signature to you.',
    answers: [
      { label: 'Yes, as a key file', hint: 'A .p12, .pfx or .pem file, and its password.', next: 'sign-keyfile' },
      { label: 'Yes, on a card or a token', hint: 'A smart card, a USB token, or an identity card with a chip.', next: 'sign-card' },
      { label: 'No, or I am not sure', next: 'sign-nocert' },
    ],
  },
  'sign-keyfile': {
    kind: 'outcome',
    journey: 'sign',
    light: 'online',
    title: 'Sign it with your key file',
    lead: 'Sign a PDF places your signature on the page and signs the file with your certificate, in this browser.',
    steps: [
      'The key file is read on your device and never sent.',
      'A signature made from a key file is an advanced signature, never a qualified one: a file can be copied. Check that the recipient accepts that level.',
    ],
    go: [{ service: 'xsignature', page: 'document', label: 'Sign a PDF' }],
  },
  'sign-card': {
    kind: 'outcome',
    journey: 'sign',
    light: 'assisted',
    title: "Use your card's own signing software",
    lead: 'A key on a card or a token cannot be reached from a web page, so this site cannot sign with it. That the key never leaves certified hardware is what makes such a signature qualified.',
    steps: [
      'Sign with the software that came with your card, or that your certificate authority provides.',
      'You can then check what the signed file claims here.',
    ],
    go: [{ service: 'xsignature', page: 'check', label: 'Check a signed PDF' }],
  },
  'sign-nocert': {
    kind: 'outcome',
    journey: 'sign',
    light: 'assisted',
    title: 'Get a certificate first',
    lead: 'A certificate authority issues one after checking who you are — some online, some in person.',
    steps: [
      'Ask the recipient which level of signature they accept.',
      'For a qualified certificate, choose a provider on the trust list of the framework the recipient works under — in the EU, a qualified trust service provider.',
      'Come back and sign with the key file it gives you, or with its own software if the key stays on a card.',
    ],
    go: [],
    sources: [S.trustList],
    checked: CHECKED,
  },
  'sign-picture': {
    kind: 'outcome',
    journey: 'sign',
    light: 'online',
    title: 'Put a picture of your signature on it',
    lead: 'Make the picture once, then place it on the PDF.',
    steps: ['A picture proves nothing about who put it there: anyone with the image can do the same.'],
    go: [
      { service: 'xsignature', page: 'signature', label: 'Make a signature image' },
      { service: 'xsignature', page: 'document', label: 'Place it on a PDF' },
    ],
  },

  // --- Power of attorney ---------------------------------------------------------------
  'poa-what': {
    kind: 'question',
    journey: 'poa',
    stage: 0,
    title: 'What will the power of attorney be used for?',
    lead: 'The form it needs depends on what the other person will do with it.',
    answers: [
      { label: 'A private matter', hint: 'Collecting a parcel, dealing with a landlord or a company.', next: 'poa-private' },
      {
        label: 'Dealing with an authority in Czechia',
        hint: 'When the authority asks for an officially verified signature.',
        next: 'official-cert',
      },
      {
        label: 'An act that needs a notarial deed',
        hint: 'Founding a company, some property and family matters.',
        next: 'poa-deed',
      },
      { label: 'Using it abroad', next: 'abroad-where' },
    ],
  },
  'poa-private': {
    kind: 'outcome',
    journey: 'poa',
    light: 'online',
    title: 'Sign it and give it to the person',
    lead: 'A power of attorney for a private matter needs no particular form, unless the other side asks for one.',
    steps: [
      'Write who may act, for what, and until when.',
      'Sign it — with a certificate for stronger evidence of who signed, or by hand.',
      'Ask whoever will rely on it whether they want the signature officially verified.',
    ],
    go: [{ service: 'xsignature', page: 'document', label: 'Sign a PDF' }],
  },
  'poa-deed': {
    kind: 'outcome',
    journey: 'poa',
    light: 'assisted',
    title: 'Its signature must be verified by an authorised person',
    lead: 'For an act that needs a public deed, the power of attorney needs an officially verified signature, and the electronic substitute in § 6(2) of Act 12/2020 Coll. does not apply to it (§ 6(3)).',
    steps: [
      'Have the signature verified in person, at a notary or a Czech POINT office.',
      'Or ask the notary whether they can verify an electronic signature remotely (§ 74a of the Notarial Code), or whether you can take part in the notarial act by video yourself instead of giving a power of attorney (§ 64a).',
      'Agree the route with the notary first: not every notary offers the remote options.',
    ],
    go: [],
    sources: [S.act12, S.civil, S.notarial],
    checked: CHECKED,
  },

  // --- Prove ---------------------------------------------------------------------------
  'proof-kind': {
    kind: 'question',
    journey: 'proof',
    stage: 0,
    title: 'Make a new proof, or check one you have?',
    lead: 'No certificate is needed for either.',
    answers: [
      { label: 'Make a proof for a file now', hint: 'Later, show that this exact version existed by then.', next: 'proof-make' },
      { label: 'Check a proof I already have', hint: 'Match the original file to its certificate.', next: 'proof-check' },
    ],
  },
  'proof-make': {
    kind: 'outcome',
    journey: 'proof',
    light: 'online',
    title: 'Timestamp the file',
    lead: 'Only a fingerprint of the file leaves your device. Keep the file and its certificate together.',
    steps: ['A timestamp shows the file existed by that time. It says nothing about who wrote it, or whether it is true.'],
    go: [{ service: 'xnotary', page: 'notarize', label: 'Prove a file existed' }],
  },
  'proof-check': {
    kind: 'outcome',
    journey: 'proof',
    light: 'online',
    title: 'Match the file to its certificate',
    lead: 'You need the original file, unchanged, and the certificate made for it.',
    steps: ['A match shows the file existed by the time the certificate states. It does not show who wrote it.'],
    go: [{ service: 'xnotary', page: 'verify', label: 'Verify an xNotary proof' }],
  },

  // --- Check ---------------------------------------------------------------------------
  'check-kind': {
    kind: 'question',
    journey: 'check',
    stage: 0,
    title: 'What did you receive?',
    lead: 'Two different checks, for two different things.',
    answers: [
      { label: 'A signed PDF', hint: 'See who it says signed it, and whether it changed since.', next: 'check-pdf' },
      { label: 'A file and its xNotary certificate', hint: 'Match the file to the proof.', next: 'proof-check' },
    ],
  },
  'check-pdf': {
    kind: 'outcome',
    journey: 'check',
    light: 'online',
    title: 'See what the signatures in it claim',
    lead: 'Check a PDF reads each signature, and whether the file has changed since it was signed.',
    steps: ["Whether the signer's certificate deserves trust is for your PDF reader to say, against the trust list of the framework it was issued under."],
    go: [{ service: 'xsignature', page: 'check', label: 'Check a signed PDF' }],
  },

  // --- Certified copy ------------------------------------------------------------------
  'copy-what': {
    kind: 'question',
    journey: 'copy',
    stage: 0,
    title: 'What do you need?',
    lead: 'A scan, a fingerprint or a timestamp is not a certified copy: it shows when a file existed, not that it matches a paper original.',
    answers: [
      { label: 'A certified copy of a paper document', hint: 'In Czech, vidimace.', next: 'copy-paper' },
      {
        label: 'A paper document made electronic, with the same legal force',
        hint: 'Or the reverse. In Czech, autorizovaná konverze.',
        next: 'copy-convert',
      },
    ],
  },
  'copy-paper': {
    kind: 'outcome',
    journey: 'copy',
    light: 'in-person',
    title: 'Have the copy certified in person',
    lead: 'An authorised office compares the copy with the original and certifies that they match.',
    steps: [
      'Take the original to a Czech POINT office (many post offices and municipal offices) or to a notary.',
      'If you only need to show that a file existed at a given time, a timestamp does that online — but it is not a certified copy.',
    ],
    go: [{ service: 'xnotary', page: 'notarize', label: 'Prove a file existed instead' }],
    sources: [S.copies],
    checked: CHECKED,
  },
  'copy-convert': {
    kind: 'outcome',
    journey: 'copy',
    light: 'in-person',
    title: 'Ask for an authorised conversion',
    lead: 'Authorised conversion turns a paper document into an electronic one, or the reverse, with the same legal force as the original.',
    steps: ['A Czech POINT office, a notary or another authorised office does it. Bring the original.'],
    go: [],
    sources: [S.conversion],
    checked: CHECKED,
  },

  // --- Company -------------------------------------------------------------------------
  'company-what': {
    kind: 'question',
    journey: 'company',
    stage: 0,
    title: 'What do you need to do?',
    lead: 'Some company documents need a notary; others need only a verified signature.',
    answers: [
      { label: 'Set up a company, or change its founding document', hint: 'For example a limited company (s.r.o.).', next: 'company-deed' },
      {
        label: 'Sign a document for the commercial register',
        hint: "For example an owner's consent to a registered office.",
        next: 'company-filing',
      },
    ],
  },
  'company-deed': {
    kind: 'outcome',
    journey: 'company',
    light: 'assisted',
    title: 'This needs a notarial deed',
    lead: 'Founding a limited company and changing its founding document are done before a notary, as a notarial deed.',
    steps: [
      'Ask a notary whether you can take part by video with an electronic identity (§ 64a of the Notarial Code). Not every notary offers it.',
      'The notary usually files the change with the commercial register directly.',
    ],
    go: [],
    sources: [S.notarial],
    checked: CHECKED,
  },
  'company-filing': {
    kind: 'outcome',
    journey: 'company',
    light: 'online',
    title: 'Sign it with a recognised electronic signature',
    lead: 'Where the register requires an officially verified signature on such a document, the Czech online route applies: a recognised electronic signature on a qualified certificate that can be tied to you through the population register (§ 6(2) of Act 12/2020 Coll.).',
    steps: CZ_ROUTE_STEPS,
    go: [{ service: 'xsignature', page: 'document', label: 'Sign a PDF' }],
    sources: [S.dia, S.act12, S.portal, S.act297],
    checked: CHECKED,
  },

  // --- Property ------------------------------------------------------------------------
  'property-what': {
    kind: 'question',
    journey: 'property',
    stage: 0,
    title: 'What do you need to sign?',
    lead: 'A contract the land registry will act on, and a document for your lawyer, have different requirements.',
    answers: [
      { label: 'A purchase contract for the land registry', next: 'property-contract' },
      { label: 'A draft or a document for my lawyer', next: 'sign-setup' },
    ],
  },
  'property-contract': {
    kind: 'outcome',
    journey: 'property',
    light: 'assisted',
    title: 'Ask your lawyer or the land registry which form it needs',
    lead: 'The land registry has its own rules for how a contract is signed, on paper or electronically, and every party has to meet them.',
    steps: [
      'Ask which signatures it accepts from each party, and whether the contract needs a qualified electronic timestamp.',
      'A timestamp from this site is anchored in Bitcoin: it is evidence of when a file existed, not a qualified timestamp.',
    ],
    go: [],
  },

  // --- Abroad --------------------------------------------------------------------------
  'abroad-where': {
    kind: 'question',
    journey: 'abroad',
    stage: 0,
    title: 'Where will the document be used?',
    lead: 'The rules of the country it goes to apply.',
    answers: [
      { label: 'Another EU country', next: 'abroad-ask-eu' },
      { label: 'Outside the EU', next: 'abroad-ask-world' },
      { label: 'Czechia (CZ)', next: 'official-ask' },
    ],
  },
  'abroad-ask-eu': {
    kind: 'question',
    journey: 'abroad',
    stage: 1,
    title: 'What has the recipient asked for?',
    lead: 'If you are not sure, ask them before you sign anything.',
    answers: [
      { label: 'An electronic signature', next: 'abroad-esig-eu' },
      { label: 'A declaration or affidavit signed before a notary', next: 'abroad-sworn-eu' },
      { label: 'A certified copy', next: 'copy-what' },
    ],
  },
  'abroad-ask-world': {
    kind: 'question',
    journey: 'abroad',
    stage: 1,
    title: 'What has the recipient asked for?',
    lead: 'If you are not sure, ask them before you sign anything.',
    answers: [
      { label: 'An electronic signature', next: 'abroad-esig-world' },
      {
        label: 'An officially verified signature, or a declaration before a notary',
        hint: 'Including an affidavit.',
        next: 'abroad-sworn-world',
      },
      { label: 'A certified copy', next: 'copy-what' },
    ],
  },
  'abroad-esig-eu': {
    kind: 'outcome',
    journey: 'abroad',
    light: 'online',
    title: 'A qualified signature carries across the EU',
    lead: 'In the EU, a qualified electronic signature has the effect of a handwritten one, and one made in one member state is recognised in all of them.',
    steps: [
      'A signature made here from a key file is advanced, not qualified. Check that the recipient accepts that, or sign with a qualified signature from your provider.',
      'Ask whether they also need the signature verified by an authority: a qualified signature is not that.',
    ],
    go: [{ service: 'xsignature', page: 'document', label: 'Sign a PDF' }],
    sources: [S.eidas],
    checked: CHECKED,
  },
  'abroad-esig-world': {
    kind: 'outcome',
    journey: 'abroad',
    light: 'assisted',
    title: 'Ask the recipient which signatures they accept',
    lead: 'Outside the EU, nothing obliges a recipient to accept an electronic signature made under EU rules.',
    steps: [
      'Ask which kind of electronic signature, and which format, they accept.',
      'If they accept a signature made with a certificate, sign the PDF and send it as they ask.',
    ],
    go: [{ service: 'xsignature', page: 'document', label: 'Sign a PDF' }],
  },
  'abroad-sworn-eu': {
    kind: 'outcome',
    journey: 'abroad',
    light: 'in-person',
    title: 'This needs a notary',
    lead: 'A declaration "before a notary" means a notary sees you sign and certifies it. No signature tool does that.',
    steps: [
      'A notary in Czechia certifies your signature on the declaration, also on an English-language form.',
      'Ask the recipient whether they also need a translation, or an apostille on the notary’s certification.',
    ],
    go: [],
    sources: [S.notarial],
    checked: CHECKED,
  },
  'abroad-sworn-world': {
    kind: 'outcome',
    journey: 'abroad',
    light: 'in-person',
    title: 'A notary, and usually an apostille',
    lead: 'A notary certifies your signature. Outside the EU, the recipient’s country usually also wants an apostille on that certification — or, where it is not party to the Hague Convention, a consular legalisation.',
    steps: [
      'Have the signature certified by a notary.',
      'Ask the recipient whether they need an apostille, a consular legalisation or a translation, and check the country on the Convention list.',
    ],
    go: [],
    sources: [S.apostille, S.notarial],
    checked: CHECKED,
  },
};

/** The journey a node belongs to — answers may lead from one journey into another. */
export const journeyOf = (node: NodeId): Journey => JOURNEYS.find((j) => j.id === NODES[node].journey)!;

/** Where the stepper stands at `node`: a question's own stage, or the last for an outcome. */
export function stageOf(node: NodeId): number {
  const n = NODES[node];
  return n.kind === 'question' ? n.stage : journeyOf(node).stages.length - 1;
}

/**
 * The journeys, nodes and lights in `lang`. English is the source; another language replaces the
 * words and keeps everything else — the graph, the lights, the sources' addresses — from it.
 */
export function situationsIn(lang: Lang): {
  journeys: readonly Journey[];
  nodes: Readonly<Record<NodeId, SituationNode>>;
  lights: typeof LIGHTS;
} {
  if (lang === 'en') return { journeys: JOURNEYS, nodes: NODES, lights: LIGHTS };
  const journeys = JOURNEYS.map((j) => ({ ...j, ...JOURNEYS_CS[j.id] }));
  const nodes: Record<NodeId, SituationNode> = {};
  for (const [id, node] of Object.entries(NODES)) {
    const cs = NODES_CS[id];
    if (node.kind === 'question') {
      const q = cs as QuestionCs;
      nodes[id] = { ...node, title: q.title, lead: q.lead, answers: node.answers.map((a, i) => ({ ...a, ...q.answers[i] })) };
    } else {
      const o = cs as OutcomeCs;
      nodes[id] = {
        ...node,
        title: o.title,
        lead: o.lead,
        steps: o.steps,
        go: node.go.map((g, i) => ({ ...g, label: o.go[i] })),
        sources: node.sources?.map((s) => ({ ...s, label: SOURCES_CS[s.url] ?? s.label })),
      };
    }
  }
  return { journeys, nodes, lights: LIGHTS_CS };
}
