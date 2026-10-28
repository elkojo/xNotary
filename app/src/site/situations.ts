/**
 * "Start from your situation": a few questions, then the right tool — or, as often, what to
 * ask somebody first. The content of /situations/ (hub/Situations.svelte), kept here as data so
 * that what it says can be tested.
 *
 * It names limits rather than solving them. Where a step needs an authority, a notary or a
 * certificate this site cannot provide, the outcome says so and stops; it never suggests that
 * a tool here stands in for an official act (see "Notarization is the product's name, never a
 * legal claim" in CLAUDE.md).
 *
 * Held back on purpose (owner's decision, 2026-10-28): country-by-country guidance on replacing
 * an officially verified signature — in Czechia, § 6(2) of Act 12/2020 — until its wording has
 * had legal review. Until then the official route ends at what to ask the recipient, and asks
 * no country, because nothing would use the answer.
 */
import type { ServiceId } from './services';

export type NodeId = string;
export type JourneyId = 'official' | 'sign' | 'proof' | 'check';

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
  readonly title: string;
  readonly lead: string;
  /** One or two words for the top of the result; `warn` when it is not a go-ahead. */
  readonly status: { readonly text: string; readonly warn?: boolean };
  readonly steps: readonly string[];
  /** The tools that do the next step, by service and page. */
  readonly go: readonly { readonly service: ServiceId; readonly page: string; readonly label: string }[];
}

export type SituationNode = Question | Outcome;

export const JOURNEYS: readonly Journey[] = [
  {
    id: 'official',
    title: 'Get a signature officially verified',
    description: 'Somebody asked for a certified or officially verified signature.',
    stages: ['What was asked', 'Next step'],
    first: 'official-ask',
  },
  {
    id: 'sign',
    title: 'Sign a document',
    description: 'With your certificate, or with a picture of your signature.',
    stages: ['Kind of signature', 'Your certificate', 'Next step'],
    first: 'sign-kind',
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
];

export const NODES: Readonly<Record<NodeId, SituationNode>> = {
  // --- Officially verified ---------------------------------------------------------------
  'official-ask': {
    kind: 'question',
    journey: 'official',
    stage: 0,
    title: 'What has the recipient asked for?',
    lead: 'A signed PDF, an officially verified signature and a notarial deed are three different things. If you are not sure, choose the last answer.',
    answers: [
      {
        label: 'An officially verified signature',
        hint: 'A certified signature or a legalised one — in Czech, úředně ověřený podpis.',
        next: 'official-verified',
      },
      { label: 'An electronic signature on a PDF', hint: 'A signed document, with no official certification.', next: 'sign-kind' },
      { label: 'A notarial deed', hint: 'A document a notary has to draw up.', next: 'official-deed' },
      { label: 'I am not sure', next: 'official-unsure' },
    ],
  },
  'official-verified': {
    kind: 'outcome',
    journey: 'official',
    title: 'Ask the recipient how they accept it',
    lead: 'Whether an electronic signature can take the place of an officially verified one depends on the country, the document and the authority. This site does not verify signatures officially, and cannot.',
    status: { text: 'Confirm first', warn: true },
    steps: [
      'Ask whether they accept an electronic signature instead, and which level of one.',
      'Ask which format they need, and whether they still want a signed original on paper.',
      'Ask how they will link the signature to you. Some countries let a qualified electronic signature stand in for an officially verified one, but only when the authority can tie its certificate to the signer — in Czechia, through the population register. No page on this site can make that check.',
    ],
    go: [{ service: 'xsignature', page: 'document', label: 'If they accept an electronic signature: Sign a PDF' }],
  },
  'official-deed': {
    kind: 'outcome',
    journey: 'official',
    title: 'This needs a notary',
    lead: 'A notarial deed is drawn up by a notary. No signature tool, here or anywhere else, makes one.',
    status: { text: 'Notary needed', warn: true },
    steps: [
      'Ask the recipient which country the deed must come from.',
      'Ask a notary there whether they can act remotely for this kind of deed.',
    ],
    go: [],
  },
  'official-unsure': {
    kind: 'outcome',
    journey: 'official',
    title: 'First, find out what is required',
    lead: 'Signing a PDF, having a signature officially verified and having a deed drawn up are different procedures. Doing the wrong one costs more than asking.',
    status: { text: 'Not confirmed yet', warn: true },
    steps: [
      'Ask the recipient: do you accept an electronic signature, or do you need an officially verified signature or a notarial deed?',
      'If an electronic signature: ask which level and which format.',
      'Come back with the answer and start again.',
    ],
    go: [],
  },

  // --- Sign ------------------------------------------------------------------------------
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
      { label: 'An officially verified signature', hint: 'Certified or legalised.', next: 'official-ask' },
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
    title: 'Sign it with your key file',
    lead: 'Sign a PDF places your signature on the page and signs the file with your certificate, in this browser.',
    status: { text: 'Ready' },
    steps: [
      'The key file is read on your device and never sent.',
      'A signature made from a key file is an advanced signature, never a qualified one: a file can be copied. Check that the recipient accepts that level.',
    ],
    go: [{ service: 'xsignature', page: 'document', label: 'Sign a PDF' }],
  },
  'sign-card': {
    kind: 'outcome',
    journey: 'sign',
    title: "Use your card's own signing software",
    lead: 'A key on a card or a token cannot be reached from a web page, so this site cannot sign with it. That the key never leaves certified hardware is what makes such a signature qualified.',
    status: { text: 'Not on this site', warn: true },
    steps: [
      'Sign with the software that came with your card, or that your certificate authority provides.',
      'You can then check what the signed file claims here.',
    ],
    go: [{ service: 'xsignature', page: 'check', label: 'Check a signed PDF' }],
  },
  'sign-nocert': {
    kind: 'outcome',
    journey: 'sign',
    title: 'Get a certificate first',
    lead: 'A certificate authority issues one after checking who you are — some online, some in person.',
    status: { text: 'Setup needed', warn: true },
    steps: [
      'Ask the recipient which level of signature they accept.',
      'For a qualified signature, choose a provider on the trust list of the framework the recipient works under — in the EU, a qualified trust service provider.',
      'Come back and sign with the key file it gives you, or with its own software if the key stays on a card.',
    ],
    go: [],
  },
  'sign-picture': {
    kind: 'outcome',
    journey: 'sign',
    title: 'Put a picture of your signature on it',
    lead: 'Make the picture once, then place it on the PDF.',
    status: { text: 'No certificate needed' },
    steps: ['A picture proves nothing about who put it there: anyone with the image can do the same.'],
    go: [
      { service: 'xsignature', page: 'signature', label: 'Make a signature image' },
      { service: 'xsignature', page: 'document', label: 'Place it on a PDF' },
    ],
  },

  // --- Prove -----------------------------------------------------------------------------
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
    title: 'Timestamp the file',
    lead: 'Only a fingerprint of the file leaves your device. Keep the file and its certificate together.',
    status: { text: 'No certificate needed' },
    steps: ['A timestamp shows the file existed by that time. It says nothing about who wrote it, or whether it is true.'],
    go: [{ service: 'xnotary', page: 'notarize', label: 'Prove a file existed' }],
  },
  'proof-check': {
    kind: 'outcome',
    journey: 'proof',
    title: 'Match the file to its certificate',
    lead: 'You need the original file, unchanged, and the certificate made for it.',
    status: { text: 'No certificate needed' },
    steps: ['A match shows the file existed by the time the certificate states. It does not show who wrote it.'],
    go: [{ service: 'xnotary', page: 'verify', label: 'Verify an xNotary proof' }],
  },

  // --- Check -----------------------------------------------------------------------------
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
    title: 'See what the signatures in it claim',
    lead: 'Check a PDF reads each signature, and whether the file has changed since it was signed.',
    status: { text: 'Ready' },
    steps: ["Whether the signer's certificate deserves trust is for your PDF reader to say, against the trust list of the framework it was issued under."],
    go: [{ service: 'xsignature', page: 'check', label: 'Check a signed PDF' }],
  },
};

/** The journey a node belongs to — answers may lead from one journey into another. */
export const journeyOf = (node: NodeId): Journey => JOURNEYS.find((j) => j.id === NODES[node].journey)!;

/** Where the stepper stands at `node`: a question's own stage, or the last for an outcome. */
export function stageOf(node: NodeId): number {
  const n = NODES[node];
  return n.kind === 'question' ? n.stage : journeyOf(node).stages.length - 1;
}
