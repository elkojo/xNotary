import { describe, expect, it } from 'vitest';
import { JOURNEYS, LIGHTS, NODES, OFFICIAL_HOSTS, journeyOf, stageOf, type Outcome } from './situations';
import { SERVICES } from './services';

const outcomes = Object.entries(NODES).filter((e): e is [string, Outcome] => e[1].kind === 'outcome');
const textOf = (node: (typeof NODES)[string]) =>
  node.kind === 'question'
    ? [node.title, node.lead, ...node.answers.flatMap((a) => [a.label, a.hint ?? ''])].join(' ')
    : [node.title, node.lead, node.why, ...node.steps, ...node.go.map((g) => g.label)].join(' ');
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

  it('marks every destination answer with its place, so it can carry a flag and a code', () => {
    for (const [id, node] of Object.entries(NODES)) {
      if (node.kind !== 'question' || !/Where will the document be used/.test(node.title)) continue;
      expect(node.answers.map((a) => a.place).sort(), id).toEqual(['CZ', 'EU', 'WORLD']);
      expect(node.answers.find((a) => a.place === 'CZ')?.next, id).toBe('official-ask');
    }
  });

  it('says how to deliver, and what to do if the office is unsure, wherever the Czech route is offered', () => {
    for (const id of ['official-cz', 'company-filing']) {
      expect(textOf(NODES[id]), id).toMatch(/data box, its electronic filing office, or by e-mail with a recognised electronic signature/);
      expect(textOf(NODES[id]), id).toMatch(/If the office has not handled this before/);
      expect((NODES[id] as Outcome).sources?.map((s) => s.url), id).toContain(
        'https://www.dia.gov.cz/cs/legislativa/eidas-sluzby-vytvarejici-duveru-a-elektronicka-identifikace/informace-pro-uzivatele/pravo-na-nahrazeni-uredne-overeneho-podpisu-dle-ss-6-odst-2-zakona-c-12-2020-sb',
      );
    }
  });

  it('tells an official extract from an informative printout, and leaves identifying clients to the firm', () => {
    expect(textOf(NODES['company-authority'])).toMatch(/not an official extract/);
    expect(textOf(NODES['kyc-remote'])).toMatch(/This site does not identify anyone/);
    expect((NODES['kyc-remote'] as Outcome).light).toBe('assisted');
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
    expect(textCs('company-authority')).toMatch(/úřední výpis to není/);
    expect(textCs('kyc-remote')).toMatch(/Tato stránka nikoho neidentifikuje/);
    for (const id of ['official-cz', 'company-filing']) expect(textCs(id), id).toMatch(/Pokud se s tím úřad dosud nesetkal/);
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

import { readFileSync, readdirSync } from 'node:fs';
import { EXAMPLES_NOTE, EXAMPLE_MAX_AGE_DAYS, examplesChecked, type Example } from './situations';
import { EXAMPLES_CS, EXAMPLES_NOTE_CS } from './situations.cs';
import { staleExamples } from './situations-dates';

describe('provider examples (R3)', () => {
  const withExamples = outcomes.filter(([, o]) => o.examples?.length);
  const all: Example[] = withExamples.flatMap(([, o]) => [...o.examples!]);

  it('names some, as the owner decided (D2)', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it('never makes an example a source, or a source an example', () => {
    const sources = new Set(outcomes.flatMap(([, o]) => (o.sources ?? []).map((s) => s.url)));
    for (const e of all) {
      expect(sources.has(e.url), e.name).toBe(false);
      expect(OFFICIAL_HOSTS as readonly string[], e.name).not.toContain(new URL(e.url).host);
      expect(new URL(e.url).protocol, e.name).toBe('https:');
    }
  });

  it('never puts one on an outcome that can be done online, where it would read as the only way', () => {
    for (const [id, o] of withExamples) expect(o.light, id).not.toBe('online');
  });

  it('carries the disclaimer, with a date, in both languages', () => {
    expect(EXAMPLES_NOTE('2026-11-11')).toBe(
      'Examples only, not an endorsement or a partnership. Checked on 2026-11-11. Check with the recipient that they accept the result.',
    );
    expect(EXAMPLES_NOTE_CS('2026-11-11')).toBe(
      'Pouze příklady, nejde o doporučení ani partnerství. Ověřeno 2026-11-11. Ověřte u příjemce, že výsledek přijme.',
    );
    for (const [id, o] of withExamples) expect(examplesChecked(o.examples!), id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('describes every example in Czech too', () => {
    for (const e of all) expect(EXAMPLES_CS[e.url], e.name).toBeTruthy();
    const cs = situationsIn('cs');
    for (const [id] of withExamples) {
      const c = cs.nodes[id];
      if (c.kind === 'outcome') for (const e of c.examples!) expect(e.what, id).toBe(EXAMPLES_CS[e.url]);
    }
  });

  it('calls a provider qualified only when the trusted list the site reads says so', () => {
    const dir = new URL('../../../xsignature/app/public/issuers/', import.meta.url);
    const shards = readdirSync(dir).filter((f) => /^[0-9a-f]{2}\.json$/.test(f));
    expect(shards.length).toBeGreaterThan(0);
    // Every provider on the lists, with what it is currently granted, keyed by list and name.
    const granted = new Set<string>();
    for (const f of shards) {
      const shard = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as {
        entries: Record<string, { tl: string; s?: { n: string[]; h: { s: string; a?: string[] }[] }[] }[]>;
      };
      for (const entries of Object.values(shard.entries))
        for (const entry of entries)
          for (const service of entry.s ?? []) {
            const current = service.h[0];
            if (current?.s === 'granted' && current.a?.includes('ForeSignatures'))
              for (const n of service.n) granted.add(`${entry.tl}/${n}`);
          }
    }
    for (const e of all) {
      if (e.kind !== 'qtsp') continue;
      expect(e.trustList, e.name).toBeDefined();
      expect(granted.has(`${e.trustList!.country}/${e.trustList!.name}`), `${e.name} on the ${e.trustList!.country} list`).toBe(true);
    }
  });

  it('never calls an identity service qualified', () => {
    for (const e of all.filter((x) => x.kind === 'identity')) {
      expect(e.what, e.name).not.toMatch(/\bis qualified|a qualified (electronic )?signature\b/i);
      expect(EXAMPLES_CS[e.url], e.name).toMatch(/ne kvalifikovaný/);
    }
  });

  it('fails a release once an example is too old to trust', () => {
    expect(EXAMPLE_MAX_AGE_DAYS).toBe(180);
    expect(staleExamples(new Date('2026-11-11T00:00:00Z'))).toEqual([]);
    const later = staleExamples(new Date('2027-06-01T00:00:00Z'));
    expect(later.length).toBeGreaterThan(0);
    expect(later[0]).toMatchObject({ checked: '2026-11-11' });
  });
});

import { trail } from './situations';

describe('why this route (R4)', () => {
  /** Every path from a journey's first question to an outcome, as the page walks them. */
  function paths(): string[][] {
    const out: string[][] = [];
    const walk = (path: string[]) => {
      const node = NODES[path.at(-1)!];
      if (node.kind === 'outcome') return void out.push(path);
      for (const a of node.answers) if (!path.includes(a.next)) walk([...path, a.next]);
    };
    for (const j of JOURNEYS) walk([j.first]);
    return out;
  }

  it('gives every outcome the one sentence that decides it, in both languages', () => {
    const cs = situationsIn('cs');
    for (const [id, o] of outcomes) {
      expect(o.why, id).toMatch(/^\S.{20,}\.$/);
      const c = cs.nodes[id];
      expect(c.kind === 'outcome' && c.why, id).toMatch(/^\S.{20,}\.$/);
    }
  });

  it('renders the answers behind every outcome reached, each with the question it answered', () => {
    const all = paths();
    expect(new Set(all.map((p) => p.at(-1))).size).toBe(outcomes.length);
    for (const path of all) {
      const t = trail(path);
      expect(t.map((s) => s.at), path.join(' → ')).toEqual(path.slice(0, -1).map((_, i) => i));
      for (const step of t) expect(step.answer.next).toBe(path[step.at + 1]);
    }
  });

  it('shows the destination first on the Czech route, as the page says it', () => {
    const t = trail(['official-where', 'official-ask', 'official-cert', 'official-cz']);
    expect(t.map((s) => s.answer.place ?? s.answer.label)).toEqual(['CZ', 'An officially verified signature', 'Yes']);
  });

  it('invents nothing for a path opened mid-way, and changing an answer gives a new result', () => {
    expect(trail(['sign-nocert'])).toEqual([]);
    expect(trail(['official-cert', 'official-cz']).map((s) => s.question.title)).toEqual([
      'Do you have a qualified certificate for electronic signatures?',
    ]);
    // "Change an answer" truncates the path to that question; the next answer replaces the rest.
    const changed = [...['official-where', 'official-ask', 'official-cert', 'official-cz'].slice(0, 3), 'official-nocert'];
    expect(trail(changed).at(-1)?.answer.label).toBe('No, or I am not sure');
  });
});
