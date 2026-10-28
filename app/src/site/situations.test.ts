import { describe, expect, it } from 'vitest';
import { JOURNEYS, LIGHTS, NODES, OFFICIAL_HOSTS, journeyOf, stageOf, type Outcome } from './situations';
import { SERVICES } from './services';

const outcomes = Object.entries(NODES).filter((e): e is [string, Outcome] => e[1].kind === 'outcome');
const textOf = (node: (typeof NODES)[string]) =>
  node.kind === 'question'
    ? [node.title, node.lead, ...node.answers.flatMap((a) => [a.label, a.hint ?? ''])].join(' ')
    : [node.title, node.lead, ...node.steps, ...node.go.map((g) => g.label)].join(' ');
const everything = Object.values(NODES).map(textOf).join(' ');

describe('the graph', () => {
  it('leads every answer somewhere that exists', () => {
    for (const node of Object.values(NODES)) {
      if (node.kind === 'question') for (const answer of node.answers) expect(NODES[answer.next], answer.next).toBeDefined();
    }
    for (const journey of JOURNEYS) expect(NODES[journey.first]).toBeDefined();
  });

  it('ends every path in an outcome', () => {
    const reaches = (id: string, seen: Set<string>): boolean => {
      const node = NODES[id];
      if (node.kind === 'outcome') return true;
      if (seen.has(id)) return true; // a way back to a question already asked: Back covers it
      return node.answers.every((a) => reaches(a.next, new Set([...seen, id])));
    };
    for (const journey of JOURNEYS) expect(reaches(journey.first, new Set())).toBe(true);
  });

  it('leaves no node unreachable', () => {
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const node = NODES[id];
      if (node.kind === 'question') node.answers.forEach((a) => walk(a.next));
    };
    JOURNEYS.forEach((j) => walk(j.first));
    expect(Object.keys(NODES).filter((id) => !seen.has(id))).toEqual([]);
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

  it('puts the official route first — it is the one the menu and the front page lead with', () => {
    expect(JOURNEYS[0].id).toBe('official');
  });
});

describe('the traffic light and the sources', () => {
  it('gives every outcome a light', () => {
    for (const [id, outcome] of outcomes) expect(LIGHTS[outcome.light], id).toBeDefined();
  });

  it('names sources and the day they were checked wherever a rule of law is cited', () => {
    for (const [id, outcome] of outcomes) {
      if (/§|Act \d|Code|Regulation|Convention/.test(textOf(outcome))) {
        expect(outcome.sources?.length, id).toBeGreaterThan(0);
        expect(outcome.checked, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('takes sources only from the law and the authorities, over https', () => {
    for (const [id, outcome] of outcomes) {
      for (const source of outcome.sources ?? []) {
        const url = new URL(source.url);
        expect(url.protocol, id).toBe('https:');
        expect(OFFICIAL_HOSTS as readonly string[], `${id}: ${url.host}`).toContain(url.host);
      }
    }
  });

  it('links nowhere outside the site except through those sources', () => {
    expect(everything).not.toMatch(/https?:\/\//);
  });
});

describe('what it may say', () => {
  it('never claims that this site performs an official act', () => {
    expect(everything).not.toMatch(/(this site|xNotary|xSignature|we) (verifies|certifies|notari[sz]es|legalises)/i);
    expect(everything).toMatch(/this site does not, and cannot/);
  });

  it('never calls a key-file signature qualified', () => {
    expect(textOf(NODES['sign-keyfile'])).toMatch(/never a qualified one/);
    expect(textOf(NODES['abroad-esig-eu'])).toMatch(/advanced, not qualified/);
  });

  it('shows the § 6(3) exception wherever the Czech route is offered', () => {
    for (const id of ['official-cz', 'company-filing']) expect(textOf(NODES[id]), id).toMatch(/§ 6\(3\)/);
    expect(textOf(NODES['poa-deed'])).toMatch(/does not apply to it \(§ 6\(3\)\)/);
  });

  it('offers the Czech route only once the document is known to go to Czechia', () => {
    const where = NODES['official-where'];
    expect(where.kind === 'question' && where.answers.find((a) => a.next === 'official-ask')?.label).toMatch(/Czechia/);
  });

  it('names the EU as the example, after the general rule', () => {
    for (const text of Object.values(NODES).map(textOf)) {
      const eu = text.search(/\bin the EU\b/i);
      if (eu >= 0 && /trust list/.test(text)) expect(text.slice(0, eu)).toMatch(/trust list/);
    }
  });

  it('keeps the picture apart from a signature, and a timestamp apart from a certified copy', () => {
    expect(textOf(NODES['sign-picture'])).toMatch(/proves nothing/);
    expect(textOf(NODES['copy-what'])).toMatch(/not a certified copy/);
  });
});
