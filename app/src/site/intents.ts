/**
 * The "I want to…" box (R1): a few typed words, matched against this table, suggest one or two
 * journeys on /situations/. Matching happens here, in the page: nothing typed is stored or sent,
 * and there is no AI — a word list, in English and Czech, that a test holds to real phrasings.
 *
 * A suggestion may start a journey, or answer a question whose answers only choose a tool
 * (`choosesTool` in situations.ts). It never skips a question that decides a legal route — where
 * the document goes, what was asked — so a typed phrase cannot land anyone on an outcome the
 * questions would not have led them to.
 *
 * Terms are written without diacritics and in lower case, as `normalize` leaves the input:
 * `plna moc` matches "plná moc". Each word of a term matches the start of a word typed, so
 * `overen podpis` matches "ověřený podpis" and "ověřeného podpisu"; a word of three letters or
 * fewer must match a whole word, so `aml` does not match "amlodipine". `strong` terms name the
 * situation outright and weigh more than `terms`, which only point towards it.
 */
import { JOURNEYS, NODES, type JourneyId, type NodeId } from './situations';

export interface Intent {
  readonly target: NodeId;
  readonly strong: readonly string[];
  readonly terms: readonly string[];
}

const STRONG = 5;
const TERM = 2;

export const INTENTS: readonly Intent[] = [
  {
    target: 'official-where',
    strong: [
      'officially verified', 'verified signature', 'certified signature', 'signature certified', 'signature verified',
      'notarised signature', 'notarized signature', 'legalise', 'legalize', 'legalisation', 'legalization',
      'uredne overen', 'overen podpis', 'overit podpis', 'overeni podpisu', 'legaliz', 'uredni overeni',
    ],
    terms: ['authority', 'government', 'office', 'urad', 'uredn', 'czech point'],
  },
  {
    target: 'sign-kind',
    // To sign is also the verb of most other situations ("sign a contract for the land registry"),
    // so it only points here; the kinds of signature name it.
    strong: ['electronic signature', 'e signature', 'esign', 'digital signature', 'elektronick podpis', 'digitalni podpis'],
    terms: ['sign', 'signature', 'podpis', 'podepsat', 'podepis', 'pdf', 'key file', 'certifikat', 'certificate'],
  },
  {
    target: 'poa-what',
    strong: ['power of attorney', 'plna moc', 'plnou moc', 'plne moci', 'plnou moci', 'zmocnen', 'zmocnit', 'proxy'],
    terms: ['act for me', 'on my behalf', 'authorise someone', 'authorize someone', 'represent', 'zastup', 'jednat za me', 'za me'],
  },
  {
    target: 'proof-kind',
    strong: ['timestamp', 'time stamp', 'file existed', 'proof of existence', 'casove razitko', 'casovym razitkem', 'existoval', 'existenc', 'opentimestamps'],
    terms: ['prove', 'proof', 'existed', 'dolozit', 'prokazat', 'dukaz', 'bitcoin', 'blockchain', 'when i wrote', 'who was first', 'autorstv'],
  },
  {
    target: 'proof-make',
    strong: ['make a proof', 'create a proof', 'timestamp my', 'timestamp a', 'vytvorit dukaz', 'oznacit casov'],
    terms: [],
  },
  {
    target: 'proof-check',
    strong: ['verify a proof', 'check a proof', 'verify my proof', 'xnotary proof', 'xnotary certificate', 'certificate 1', 'ots file', 'overit dukaz', 'zkontrolovat dukaz'],
    terms: ['ots'],
  },
  {
    target: 'check-kind',
    strong: ['check a signed', 'check a document', 'check the signature', 'validate', 'is it valid', 'zkontrolovat', 'overit prijat', 'prijaty dokument', 'dostal jsem'],
    terms: ['check', 'received', 'verify', 'kontrol', 'prijat', 'dostal', 'genuine', 'pravost'],
  },
  {
    target: 'check-pdf',
    strong: ['signed pdf', 'podepsane pdf', 'podepsany soubor', 'asice', 'asics', 'p7m', 'signature valid', 'platny podpis'],
    terms: [],
  },
  {
    target: 'copy-what',
    strong: ['certified copy', 'true copy', 'overena kopie', 'overenou kopii', 'vidimac', 'konverz', 'autorizovana konverze', 'opis'],
    terms: ['copy', 'kopie', 'kopii', 'scan', 'sken', 'paper original', 'original'],
  },
  {
    target: 'company-what',
    strong: [
      'company', 'commercial register', 'business register', 'obchodni rejstrik', 'obchodniho rejstriku', 'obchodnim rejstriku',
      'spolecnost', 'firm', 's r o', 'sro', 'registered office', 'sidlo', 'jednatel', 'act for a company', 'authority to act',
      'vypis z rejstriku', 'register extract', 'vypis z obchodniho',
    ],
    terms: ['founding', 'shareholder', 'spolecnik', 'director', 'zalozit', 'zalozeni', 'extract', 'vypis', 'statutar', 'podnik'],
  },
  {
    target: 'property-what',
    strong: ['land registry', 'katastr', 'nemovitost', 'real estate', 'property', 'kupni smlouv', 'purchase contract', 'vklad'],
    terms: ['house', 'flat', 'apartment', 'plot of land', 'pozemek', 'pozemku', 'bytu', 'dum', 'domu', 'mortgage', 'hypotek', 'buy', 'sell', 'koupit', 'prodat', 'koupe', 'prodej'],
  },
  {
    target: 'abroad-where',
    strong: ['abroad', 'another country', 'other country', 'foreign', 'zahranic', 'apostil', 'superlegaliz', 'affidavit', 'embassy', 'konzul', 'ambasad'],
    terms: ['translation', 'preklad', 'sworn', 'cizin', 'outside the eu', 'mimo eu'],
  },
  {
    target: 'kyc-remote',
    strong: [
      'aml', 'kyc', 'know your customer', 'know your client', 'identify a client', 'identify a customer', 'identify clients',
      'client identification', 'customer identification', 'money laundering', 'prani penez', 'identifikac', 'identifikovat klient',
      'povinna osoba', 'due diligence',
    ],
    terms: ['leasing', 'onboarding', 'identify', 'identifikovat', 'klient', 'client', 'customer'],
  },
];

/** Lower case, no diacritics, words separated by single spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Whether `term` (normalized) occurs in `words`, each of its words starting a typed word. */
function occurs(term: string, words: readonly string[]): boolean {
  const parts = term.split(' ');
  const fits = (part: string, word: string) => (part.length <= 3 ? word === part : word.startsWith(part));
  for (let i = 0; i + parts.length <= words.length; i++) if (parts.every((p, k) => fits(p, words[i + k]))) return true;
  return false;
}

export interface Suggestion {
  readonly target: NodeId;
  readonly journey: JourneyId;
  readonly score: number;
}

/**
 * At most two suggestions, best first, one per journey; none for a phrase that matches nothing.
 * A journey scores everything matched in it. It starts at its first question unless a term
 * names one of its tool choices outright (`strong`), and then starts there. Ties keep the order
 * of the journeys on the page.
 */
export function suggest(text: string): Suggestion[] {
  const words = normalize(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out: Suggestion[] = [];
  for (const journey of JOURNEYS) {
    let score = 0;
    let target = journey.first;
    let deepest = 0;
    for (const intent of INTENTS) {
      if (NODES[intent.target].journey !== journey.id) continue;
      const strong = intent.strong.filter((t) => occurs(t, words)).length;
      score += strong * STRONG + intent.terms.filter((t) => occurs(t, words)).length * TERM;
      if (intent.target !== journey.first && strong > deepest) [target, deepest] = [intent.target, strong];
    }
    if (score) out.push({ target, journey: journey.id, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 2); // a stable sort keeps the page's order on a tie
}
