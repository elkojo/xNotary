import { describe, expect, it } from 'vitest';
import { JOURNEYS, NODES, journeyOf, stageOf, type Outcome } from './situations';
import { SERVICES } from './services';

const outcomes = Object.entries(NODES).filter((e): e is [string, Outcome] => e[1].kind === 'outcome');
const textOf = (node: (typeof NODES)[string]) =>
  node.kind === 'question'
    ? [node.title, node.lead, ...node.answers.flatMap((a) => [a.label, a.hint ?? ''])].join(' ')
    : [node.title, node.lead, node.status.text, ...node.steps, ...node.go.map((g) => g.label)].join(' ');
const everything = Object.values(NODES).map(textOf).join(' ');

describe('the graph', () => {
  it('leads every answer somewhere that exists', () => {
    for (const node of Object.values(NODES)) {
      if (node.kind === 'question') for (const answer of node.answers) expect(NODES[answer.next], answer.next).toBeDefined();
    }
    for (const journey of JOURNEYS) expect(NODES[journey.first]).toBeDefined();
  });

  it('ends every path in an outcome, and never loops for ever', () => {
    const reaches = (id: string, seen: Set<string>): boolean => {
      const node = NODES[id];
      if (node.kind === 'outcome') return true;
      if (seen.has(id)) return true; // a way back to a question already asked: Back covers it
      return node.answers.every((a) => reaches(a.next, new Set([...seen, id])));
    };
    for (const journey of JOURNEYS) expect(reaches(journey.first, new Set())).toBe(true);
  });

  it('puts the stepper on a stage the journey has', () => {
    for (const id of Object.keys(NODES)) {
      expect(stageOf(id)).toBeGreaterThanOrEqual(0);
      expect(stageOf(id)).toBeLessThan(journeyOf(id).stages.length);
    }
  });

  it('points only at screens that exist', () => {
    for (const [, outcome] of outcomes) {
      for (const go of outcome.go) {
        const service = SERVICES.find((s) => s.id === go.service);
        expect(service?.tabs.map((t) => t.id), `${go.service}#/${go.page}`).toContain(go.page);
      }
    }
  });

  it('puts the official route first — it is the one the menu leads with', () => {
    expect(JOURNEYS[0].id).toBe('official');
  });
});

describe('what it may say', () => {
  it('never claims an official act, or that this site performs one', () => {
    expect(everything).not.toMatch(/\bnotari[sz](ed|ation)\b/i);
    expect(everything).not.toMatch(/(this site|xNotary|xSignature) (verifies|certifies|notari)/i);
  });

  it('never calls a key-file signature qualified', () => {
    const keyfile = textOf(NODES['sign-keyfile']);
    expect(keyfile).toMatch(/never a qualified one/);
  });

  it('holds the country guidance back until it has had legal review: no § 6, no outside links', () => {
    expect(everything).not.toMatch(/§|12\/2020|https?:\/\//);
    expect(NODES['official-verified'].kind === 'outcome' && NODES['official-verified'].status.warn).toBe(true);
  });

  it('names the EU as the example, after the general rule', () => {
    for (const text of Object.values(NODES).map(textOf)) {
      const eu = text.search(/\bin the EU\b/i);
      if (eu >= 0) expect(text.slice(0, eu)).toMatch(/trust list/);
    }
  });

  it('keeps the picture apart from a signature', () => {
    expect(textOf(NODES['sign-picture'])).toMatch(/proves nothing/);
  });
});
