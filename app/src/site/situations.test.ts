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

import { FORBIDDEN_CS, GLOSSARY_CS } from './glossary';
import { JOURNEYS_CS, NODES_CS, SOURCES_CS } from './situations.cs';
import { situationsIn } from './situations';

describe('the Czech', () => {
  const cs = situationsIn('cs');
  const textCs = (id: string) => textOf(cs.nodes[id]);

  it('mirrors the English shape exactly: every journey, node, answer, step and link', () => {
    expect(Object.keys(JOURNEYS_CS).sort()).toEqual(JOURNEYS.map((j) => j.id).sort());
    expect(Object.keys(NODES_CS).sort()).toEqual(Object.keys(NODES).sort());
    for (const j of JOURNEYS) expect(JOURNEYS_CS[j.id].stages.length, j.id).toBe(j.stages.length);
    for (const [id, node] of Object.entries(NODES)) {
      const c = NODES_CS[id];
      if (node.kind === 'question') {
        expect('answers' in c && c.answers.length, id).toBe(node.answers.length);
        if ('answers' in c) node.answers.forEach((a, i) => expect(Boolean(c.answers[i].hint), `${id}#${i} hint`).toBe(Boolean(a.hint)));
      } else {
        expect('steps' in c && c.steps.length, id).toBe(node.steps.length);
        expect('go' in c && c.go.length, id).toBe(node.go.length);
      }
    }
  });

  it('keeps the graph, the lights and the sources’ addresses from the English', () => {
    for (const [id, node] of Object.entries(NODES)) {
      const c = cs.nodes[id];
      expect(c.kind, id).toBe(node.kind);
      if (node.kind === 'question' && c.kind === 'question') expect(c.answers.map((a) => a.next), id).toEqual(node.answers.map((a) => a.next));
      if (node.kind === 'outcome' && c.kind === 'outcome') {
        expect(c.light, id).toBe(node.light);
        expect(c.sources?.map((s) => s.url), id).toEqual(node.sources?.map((s) => s.url));
        expect(c.go.map((g) => `${g.service}/${g.page}`), id).toEqual(node.go.map((g) => `${g.service}/${g.page}`));
      }
    }
  });

  it('names every source in Czech', () => {
    for (const [, outcome] of outcomes) for (const s of outcome.sources ?? []) expect(SOURCES_CS[s.url], s.url).toBeTruthy();
  });

  it('uses the statutory term wherever the English uses the legal term', () => {
    for (const id of Object.keys(NODES)) {
      const en = textOf(NODES[id]);
      const c = textCs(id);
      for (const term of GLOSSARY_CS) if (term.en.test(en)) expect(c, `${id}: ${term.note}`).toMatch(term.cs);
    }
  });

  it('never uses a near miss, or claims an official act', () => {
    const all = Object.keys(NODES).map(textCs).join(' ') + ' ' + Object.values(JOURNEYS_CS).map((j) => `${j.title} ${j.description}`).join(' ');
    for (const f of FORBIDDEN_CS) expect(all, f.why).not.toMatch(f.cs);
    expect(all).not.toMatch(/https?:\/\//);
  });

  it('keeps every limit the English states', () => {
    expect(textCs('official-cz')).toMatch(/tato stránka to neověřuje a ani nemůže/);
    for (const id of ['official-cz', 'company-filing']) expect(textCs(id), id).toMatch(/§ 6 odst\. 3/);
    expect(textCs('poa-deed')).toMatch(/nevztahuje \(§ 6 odst\. 3\)/);
    expect(textCs('sign-keyfile')).toMatch(/nikdy kvalifikovaný/);
    expect(textCs('abroad-esig-eu')).toMatch(/zaručený, ne kvalifikovaný/);
    expect(textCs('sign-picture')).toMatch(/nic nedokazuje/);
    expect(textCs('copy-what')).toMatch(/nejsou ověřená kopie/);
  });
});

describe('the glossary itself', () => {
  it('catches the near misses it exists for', () => {
    const caught = (text: string) => FORBIDDEN_CS.some((f) => f.cs.test(text));
    expect(caught('pokročilý elektronický podpis')).toBe(true);
    expect(caught('uznaný elektronický podpis')).toBe(true);
    expect(caught('notarizace dokumentu')).toBe(true);
    expect(caught('xNotary ověří váš podpis')).toBe(true);
    expect(caught('tato stránka to neověřuje a ani nemůže')).toBe(false);
  });

  it('requires the statutory term in every inflection', () => {
    const term = GLOSSARY_CS.find((t) => t.note.startsWith('uznávaný'))!;
    for (const form of ['uznávaný elektronický podpis', 'uznávaným elektronickým podpisem', 'uznávaného elektronického podpisu'])
      expect(form).toMatch(term.cs);
  });
});
