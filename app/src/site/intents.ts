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
 *
 * Two looser matches find the best match while the reader is still typing, or mistyped, each
 * worth less than an exact one (`QUALITY`):
 * - **partial**: the last word typed — the one under the cursor — may be the start of a term's
 *   word: "nota" finds `notar`, "plná mo" finds `plna moc`. Only the last word, so a finished
 *   short word ("pro", "na") never drags in "property" or "nájem".
 * - **typo**: one letter wrong, missing, extra or swapped in a word of five letters or more, two
 *   from nine: "notray", "atorney", "smlovua".
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
    // "Notary" is how most people name an officially verified signature, so it points here: the
    // first question then separates a verified signature from a notarial deed.
    terms: [
      'authority', 'government', 'office', 'urad', 'uredn', 'czech point', 'notar', 'notaris', 'notariz', 'notarial',
      'overit', 'overeni', 'overen', 'verified', 'data box', 'datova schranka', 'datovou schrankou', 'submit', 'podat', 'podani',
      'will', 'zavet', 'inheritance', 'dedictvi', 'divorce', 'rozvod',
    ],
  },
  {
    target: 'sign-kind',
    // To sign is also the verb of most other situations ("sign a contract for the land registry"),
    // so it only points here; the kinds of signature name it.
    strong: ['electronic signature', 'e signature', 'esign', 'digital signature', 'elektronick podpis', 'digitalni podpis'],
    terms: [
      'sign', 'signature', 'podpis', 'podepsat', 'podepis', 'pdf', 'key file', 'certifikat', 'certificate',
      'contract', 'agreement', 'smlouv', 'dohod', 'lease', 'rent', 'najem', 'landlord', 'pronajimat', 'consent', 'souhlas',
      'document', 'dokument', 'listin', 'bank id', 'bankid', 'bankovni identit',
    ],
  },
  {
    target: 'poa-what',
    strong: ['power of attorney', 'plna moc', 'plnou moc', 'plne moci', 'plnou moci', 'zmocnen', 'zmocnit', 'proxy'],
    terms: ['act for me', 'on my behalf', 'authorise someone', 'authorize someone', 'represent', 'zastup', 'jednat za me', 'za me', 'power', 'mandate', 'attorney'],
  },
  {
    target: 'proof-kind',
    strong: ['timestamp', 'time stamp', 'file existed', 'proof of existence', 'casove razitko', 'casovym razitkem', 'existoval', 'existenc', 'opentimestamps'],
    terms: ['prove', 'proof', 'existed', 'dolozit', 'prokazat', 'dukaz', 'bitcoin', 'blockchain', 'when i wrote', 'who was first', 'autorstv', 'razitk', 'date of', 'datum'],
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
    strong: [
      'certified copy', 'true copy', 'overena kopie', 'overenou kopii', 'vidimac', 'konverz', 'autorizovana konverze', 'opis',
      // Papers people most often need a certified copy of.
      'birth certificate', 'rodn list', 'rodneho listu', 'marriage certificate', 'oddac list', 'diploma', 'diplom', 'vysvedceni',
      'criminal record', 'rejstrik trest', 'rejstriku trest',
    ],
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
    strong: ['abroad', 'another country', 'other country', 'foreign', 'zahranic', 'apostil', 'superlegaliz', 'affidavit', 'embassy', 'konzul', 'ambasad', 'translat', 'preklad'],
    // An apostille or a legalisation decides the request even when it names a document too
    // ("apostille for a birth certificate"), so those weigh twice.
    terms: ['apostil', 'superlegaliz', 'sworn', 'cizin', 'outside the eu', 'mimo eu', 'visa', 'viz', 'embass'],
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

/** How much a match counts, by how it matched. */
const QUALITY = { exact: 1, partial: 0.7, typo: 0.6 } as const;

/** Edit distance with adjacent swaps (optimal string alignment), stopping early past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How a term's word matches one typed word: 0 for not at all. `last`: the word being typed. */
function fit(part: string, word: string, last: boolean): number {
  if (part.length <= 3 ? word === part : word.startsWith(part)) return QUALITY.exact;
  // Still being typed: the word so far starts the term's word. Three letters at least on its own;
  // to finish a phrase whose other words already matched, any length (handled by `occurs`).
  if (last && word.length >= 3 && part.startsWith(word)) return QUALITY.partial;
  if (part.length >= 5 && word.length >= 5) {
    const max = part.length >= 9 ? 2 : 1;
    // A term's word is a stem, so compare it with the same length of the typed word; and the
    // whole word too, for a letter missing from the stem itself ("atorney" for `attorney`).
    const typo = Math.min(distance(part, word.slice(0, part.length), max), distance(part, word, max));
    if (typo <= max) return QUALITY.typo;
  }
  return 0;
}

/**
 * Where `term` (normalized) fits `words` best: its quality (0 for nowhere) and the typed words it
 * used, so that one typed word is not counted twice — "documents" fits `document` exactly and
 * `dokument` with a typo, and is one word.
 */
function occurs(term: string, words: readonly string[]): { q: number; at: number[] } {
  const parts = term.split(' ');
  let best = { q: 0, at: [] as number[] };
  for (let i = 0; i + parts.length <= words.length; i++) {
    let q = 1;
    for (let k = 0; k < parts.length && q; k++) {
      const at = i + k;
      const last = at === words.length - 1;
      let f = fit(parts[k], words[at], last);
      // The last word of a phrase may be a single letter when the rest already fits: "plná m".
      if (!f && last && k > 0 && parts[k].startsWith(words[at])) f = QUALITY.partial;
      q = Math.min(q, f);
    }
    if (q > best.q) best = { q, at: parts.map((_, k) => i + k) };
  }
  return best;
}

export interface Suggestion {
  readonly target: NodeId;
  readonly journey: JourneyId;
  readonly score: number;
}

/**
 * At most two suggestions, best first, one per journey; none for a phrase that matches nothing.
 * A journey scores everything matched in it, each match weighed by how well it matched. It starts at its first question unless a term
 * names one of its tool choices outright (`strong`), and then starts there. Ties keep the order
 * of the journeys on the page.
 */
export function suggest(text: string): Suggestion[] {
  const words = normalize(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out: Suggestion[] = [];
  for (const journey of JOURNEYS) {
    // Every match in this journey, best first; each typed word counts once, at its best.
    const matches: { q: number; at: number[]; weight: number; target: NodeId; strong: boolean }[] = [];
    for (const intent of INTENTS) {
      if (NODES[intent.target].journey !== journey.id) continue;
      for (const [terms, weight, strong] of [[intent.strong, STRONG, true], [intent.terms, TERM, false]] as const)
        for (const t of terms) {
          const m = occurs(t, words);
          if (m.q) matches.push({ ...m, weight, target: intent.target, strong });
        }
    }
    matches.sort((a, b) => b.q * b.weight - a.q * a.weight);
    const used = new Set<number>();
    let score = 0;
    let target = journey.first;
    let deepest = 0;
    const deeper = new Map<NodeId, number>();
    for (const m of matches) {
      // A phrase that shares a word with a better match still counts when it matched exactly:
      // "plna moc" and "plnou moc" are different terms, and an exact phrase is real evidence.
      if (m.q < 1 && m.at.some((i) => used.has(i))) continue;
      m.at.forEach((i) => used.add(i));
      score += m.q * m.weight;
      if (m.strong && m.target !== journey.first) deeper.set(m.target, (deeper.get(m.target) ?? 0) + m.q);
    }
    for (const [t, n] of deeper) if (n > deepest) [target, deepest] = [t, n];
    if (score) out.push({ target, journey: journey.id, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 2); // a stable sort keeps the page's order on a tie
}
