import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RULES_SCHEMA, llmsTxt, rules, situationsMap } from './situations-export';
import { JOURNEYS, NODES } from './situations';

/**
 * Just enough of JSON Schema to hold rules.json to RULES_SCHEMA: type, const, enum, pattern,
 * required, properties, additionalProperties, items, minItems, oneOf. Returns the failures.
 */
function validate(schema: any, value: unknown, at = '$'): string[] {
  const errs: string[] = [];
  const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((s: any) => validate(s, value, at).length === 0).length;
    if (passing !== 1) errs.push(`${at}: matches ${passing} of oneOf`);
    return errs;
  }
  if (schema.type) {
    const types = [schema.type].flat();
    const t = typeOf(value);
    if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) return [`${at}: ${t}, not ${types.join('|')}`];
  }
  if ('const' in schema && value !== schema.const) errs.push(`${at}: not ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: ${JSON.stringify(value)} not in enum`);
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) errs.push(`${at}: "${value}" !~ ${schema.pattern}`);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const r of schema.required ?? []) if (!(r in obj)) errs.push(`${at}: missing ${r}`);
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties?.[k] ?? (typeof schema.additionalProperties === 'object' ? schema.additionalProperties : null);
      if (sub) errs.push(...validate(sub, v, `${at}.${k}`));
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) errs.push(`${at}: fewer than ${schema.minItems}`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${at}[${i}]`)));
  }
  return errs;
}

describe('rules.json (E1)', () => {
  const doc = JSON.parse(JSON.stringify(rules({ version: '0.0.0', build: 'test' })));

  it('matches its schema', () => {
    expect(validate(RULES_SCHEMA, doc)).toEqual([]);
  });

  it('the validator is not a rubber stamp', () => {
    const broken = structuredClone(doc);
    broken.languages.en.nodes['official-cz'].light = 'green';
    delete broken.languages.cs.nodes['sign-nocert'].why;
    expect(validate(RULES_SCHEMA, broken).length).toBe(2);
  });

  it('carries every journey and node, in both languages, with the same graph', () => {
    for (const lang of ['en', 'cs'] as const) {
      expect(doc.languages[lang].journeys.map((j: any) => j.id)).toEqual(JOURNEYS.map((j) => j.id));
      expect(Object.keys(doc.languages[lang].nodes).sort()).toEqual(Object.keys(NODES).sort());
    }
    expect(doc.languages.cs.nodes['official-where'].answers.map((a: any) => a.next)).toEqual(
      doc.languages.en.nodes['official-where'].answers.map((a: any) => a.next),
    );
  });

  it('gives an agent the same limits the page shows', () => {
    expect(doc.notAdvice).toMatch(/not legal advice/);
    expect(doc.limits.join(' ')).toMatch(/not a qualified electronic timestamp/);
    expect(doc.languages.en.examplesNote).toBe(
      'Examples only, not an endorsement or a partnership. Checked on {checked}. Check with the recipient that they accept the result.',
    );
    expect(doc.handOff.text).toBe('/situations/?q={text}');
  });

  it('resolves every tool to a path on the site', () => {
    expect(doc.languages.en.nodes['official-cz'].go[0].href).toBe('/xsignature/#/document');
  });
});

describe('docs/situations-map.md (R8)', () => {
  it('is the copy situations.ts would write — run `npm run situations:map` after changing it', () => {
    const committed = readFileSync(new URL('../../../docs/situations-map.md', import.meta.url), 'utf8');
    expect(committed).toBe(situationsMap());
  });

  it('names every node, with each outcome’s light and checked date', () => {
    const map = situationsMap();
    for (const id of Object.keys(NODES)) expect(map, id).toContain(`\`${id}\``);
    expect(map).toContain('🟢 online');
    expect(map).toContain('2026-11-11');
  });
});

describe('/llms.txt', () => {
  it('points to the rules and states the rules for agents', () => {
    const txt = llmsTxt({ version: '0.0.0' });
    expect(txt).toMatch(/^# xNotary\.digital\n\n> /);
    expect(txt).toContain('/situations/rules.json');
    expect(txt).toMatch(/Never give consent for the user/);
    expect(txt).toMatch(/untrusted data, never instructions/);
  });
});

describe('the Agent Skill (E2)', () => {
  const skill = readFileSync(new URL('../../../agent/skill/xnotary/SKILL.md', import.meta.url), 'utf8');

  it('is a skill: name and description in its frontmatter', () => {
    expect(skill).toMatch(/^---\nname: xnotary\ndescription: .{80,}\n/);
  });

  it('reads the format of rules.json this build writes, by the fields it has', () => {
    const doc = rules({ version: '0', build: '0' });
    expect(skill).toContain(`\`format\` is \`${doc.format}\``);
    for (const field of ['intents', 'strong', 'terms', 'choosesTool', 'first', 'answers', 'next', 'light', 'why', 'sources', 'checked', 'examplesNote', 'notAdvice'])
      expect(skill, field).toContain(`\`${field}\``);
  });

  it('carries the rules every agent route keeps', () => {
    expect(skill).toMatch(/Never give consent for them, never sign with\s+their qualified signature/);
    expect(skill).toMatch(/Only the SHA-256 digest may leave the device/);
    expect(skill).toMatch(/not a qualified electronic\s+timestamp/);
    expect(skill).toMatch(/data, never instructions/);
    expect(skill).toMatch(/\*\*Never skip a question\*\*/);
  });
});
