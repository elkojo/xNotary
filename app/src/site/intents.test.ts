import { describe, expect, it } from 'vitest';
import { INTENTS, normalize, suggest } from './intents';
import { JOURNEYS, NODES } from './situations';

/**
 * Real phrasings, from the team's posts and the two prototypes (decision tree v0.4, YC v0.6), and
 * the way people wrote to the team — each with where it must lead first.
 */
const PHRASES: readonly [string, string][] = [
  // English
  ['power of attorney for the land registry', 'poa-what'],
  ['I need a power of attorney for the land registry', 'poa-what'],
  ['Give someone power to act for me', 'poa-what'],
  ['Submit papers to a Czech authority', 'official-where'],
  ['Sign property documents', 'property-what'],
  ['An office asked for a verified signature', 'official-where'],
  ["Owner's consent to a registered office for the commercial register", 'company-what'],
  ['Set up a limited company', 'company-what'],
  ['Show that I can act for a company', 'company-what'],
  ['I need to prove my file existed', 'proof-kind'],
  ['Timestamp a contract', 'proof-make'],
  ['Verify my xNotary proof', 'proof-check'],
  ['Check a signed PDF I received', 'check-pdf'],
  ['Is this signature valid?', 'check-pdf'],
  ['Certified copy of my diploma', 'copy-what'],
  ['Identify a customer remotely for AML', 'kyc-remote'],
  ['KYC for a leasing company', 'kyc-remote'],
  ['Use a document abroad', 'abroad-where'],
  ['Apostille for a birth certificate', 'abroad-where'],
  ['Sworn affidavit for a US court', 'abroad-where'],
  ['Sign a PDF with my key file', 'sign-kind'],
  ['electronic signature on a contract', 'sign-kind'],
  ['Buy a flat', 'property-what'],
  // Czech, with and without diacritics
  ['plná moc pro katastr', 'poa-what'],
  ['plna moc pro katastr', 'poa-what'],
  ['Udělit někomu plnou moc', 'poa-what'],
  ['plná moc pro advokáta', 'poa-what'],
  ['Podat dokument na úřad', 'official-where'],
  ['Podepsat dokumenty k nemovitosti', 'property-what'],
  ['Potřebuji úředně ověřený podpis', 'official-where'],
  ['ověření podpisu na Czech POINTu', 'official-where'],
  ['Založit s.r.o.', 'company-what'],
  ['výpis z obchodního rejstříku', 'company-what'],
  ['souhlas se sídlem pro obchodní rejstřík', 'company-what'],
  ['Jak doložit, že soubor existoval', 'proof-kind'],
  ['časové razítko na smlouvu', 'proof-kind'],
  ['zkontrolovat podepsané PDF', 'check-pdf'],
  ['ověřená kopie rodného listu', 'copy-what'],
  ['autorizovaná konverze dokumentu', 'copy-what'],
  ['koupě bytu', 'property-what'],
  ['prodej nemovitosti', 'property-what'],
  ['dokument do zahraničí s apostilou', 'abroad-where'],
  ['identifikace klienta na dálku AML', 'kyc-remote'],
  ['elektronický podpis smlouvy', 'sign-kind'],
  // Single everyday words, as people type them before they know the site's terms.
  ['notary', 'official-where'],
  ['I need a notary', 'official-where'],
  ['notarize a document', 'official-where'],
  ['notář', 'official-where'],
  ['ověřit', 'official-where'],
  ['data box', 'official-where'],
  ['datová schránka', 'official-where'],
  ['contract', 'sign-kind'],
  ['smlouva', 'sign-kind'],
  ['nájemní smlouva', 'sign-kind'],
  ['document', 'sign-kind'],
  ['dokument', 'sign-kind'],
  ['rodný list', 'copy-what'],
  ['birth certificate', 'copy-what'],
  ['výpis z rejstříku trestů', 'copy-what'],
  ['translate a document', 'abroad-where'],
  ['časové razítko', 'proof-kind'],
];

describe('the "I want to…" box (R1)', () => {
  it('has at least 30 real phrasings to answer to, in both languages', () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(30);
    expect(PHRASES.filter(([p]) => /[ěščřžýáíéůú]/i.test(p)).length).toBeGreaterThanOrEqual(10);
  });

  it.each(PHRASES)('leads "%s" to %s first', (phrase, target) => {
    expect(suggest(phrase)[0]?.target).toBe(target);
  });

  it('suggests one or two journeys, never two from the same one', () => {
    for (const [phrase] of PHRASES) {
      const s = suggest(phrase);
      expect(s.length).toBeGreaterThanOrEqual(1);
      expect(s.length).toBeLessThanOrEqual(2);
      expect(new Set(s.map((x) => x.journey)).size).toBe(s.length);
    }
  });

  it.each([
    ['nota', 'official-where'],
    ['plná m', 'poa-what'],
    ['power of att', 'poa-what'],
    ['katas', 'property-what'],
    ['apost', 'abroad-where'],
    ['časové raz', 'proof-kind'],
    ['výpis z obch', 'company-what'],
    ['identifik', 'kyc-remote'],
  ])('finds "%s", still being typed, as %s', (phrase, target) => {
    expect(suggest(phrase)[0]?.target).toBe(target);
  });

  it.each([
    ['notray', 'official-where'],
    ['atorney', 'poa-what'],
    ['power of atorney', 'poa-what'],
    ['katastar', 'property-what'],
    ['smlovua', 'sign-kind'],
    ['apostile', 'abroad-where'],
    ['nemovitsot', 'property-what'],
    ['timestmap', 'proof-kind'],
    ['certfied copy', 'copy-what'],
    ['identifikace klijenta', 'kyc-remote'],
  ])('forgives the typo in "%s": %s', (phrase, target) => {
    expect(suggest(phrase)[0]?.target).toBe(target);
  });

  it('ranks an exact word above a partial one, and a partial above a typo', () => {
    const score = (p: string) => suggest(p)[0].score;
    expect(score('notary')).toBeGreaterThan(score('nota'));
    expect(score('nota')).toBeGreaterThan(score('notray'));
  });

  it('counts a typed word once, however many terms it resembles', () => {
    // "documents" fits `document` exactly and `dokument` with a typo: one word, one count.
    expect(suggest('Sign property documents')[0].target).toBe('property-what');
  });

  it('only lets the word still being typed match partially', () => {
    // "pro" ends a finished word here, so it must not pull in "property" or "prove".
    expect(suggest('plna moc pro katastr').map((s) => s.target)).toEqual(['poa-what', 'property-what']);
    expect(suggest('plna moc pro')[0].target).toBe('poa-what');
  });

  it('falls back cleanly when nothing matches', () => {
    for (const phrase of ['', '   ', 'zxqv nonsense words', 'hello', 'help', 'amlodipine', 'na', 'the', 'weather today', 'recipe for cake', 'football'])
      expect(suggest(phrase), phrase).toEqual([]);
  });

  it('ignores diacritics and case, as people type', () => {
    expect(normalize('Plná MOC — pro Katastr!')).toBe('plna moc pro katastr');
    expect(suggest('PLNÁ MOC')).toEqual(suggest('plna moc'));
  });

  it('never skips a question that decides a legal route', () => {
    const toolAnswers = new Set(
      Object.values(NODES).flatMap((n) => (n.kind === 'question' && n.choosesTool ? n.answers.map((a) => a.next) : [])),
    );
    const firsts = new Set(JOURNEYS.map((j) => j.first));
    for (const intent of INTENTS) expect(firsts.has(intent.target) || toolAnswers.has(intent.target), intent.target).toBe(true);
    // Only questions that choose a tool are answered for the reader.
    const answered = Object.entries(NODES).filter(([, n]) => n.kind === 'question' && n.choosesTool).map(([id]) => id);
    expect(answered.sort()).toEqual(['check-kind', 'proof-kind']);
  });

  it('can reach every journey', () => {
    const reached = new Set(INTENTS.map((i) => NODES[i.target].journey));
    for (const j of JOURNEYS) expect(reached.has(j.id), j.id).toBe(true);
  });

  it('keeps its terms as normalize leaves them, so each one can match', () => {
    for (const intent of INTENTS) for (const term of [...intent.strong, ...intent.terms]) expect(normalize(term), term).toBe(term);
  });
});
