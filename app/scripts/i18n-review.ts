/**
 * The review sheet for a translation: every Czech text beside its English source, with the
 * glossary on top. For the native reviewer who signs a language off (docs/i18n.md).
 *
 *   npm run i18n:review > review-cs.md
 */
import { GLOSSARY_CS } from '../src/site/glossary';
import { SERVICES, TABS_CS, TASKS } from '../src/site/services';
import { JOURNEYS, LIGHTS, NODES } from '../src/site/situations';
import { JOURNEYS_CS, LIGHTS_CS, NODES_CS, SOURCES_CS } from '../src/site/situations.cs';

const out: string[] = [];
const row = (where: string, en: string, cs: string) => out.push(`| ${where} | ${en.replace(/\|/g, '\\|')} | ${cs.replace(/\|/g, '\\|')} |`);
const table = (title: string) => out.push('', `## ${title}`, '', '| Where | English | Čeština |', '|---|---|---|');

out.push(
  '# xNotary.digital — Czech review sheet',
  '',
  'Check each Czech text against its English source: meaning first, then the legal term. Mark',
  'anything to change in the third column. The texts on the bar and the front page are short; the',
  'life situations carry the legal content and deserve the closest reading. Tests already enforce',
  'the glossary below; a reviewer may change the glossary itself.',
  '',
  'Not listed here: the short interface texts (menus, buttons, footer) in the `TEXT` constants of',
  '`src/site/SiteBar.svelte`, `hub/Hub.svelte`, `hub/Situations.svelte` and `hub/HubFooter.svelte` —',
  'read them on the page itself, at /?lang=cs and /situations/?lang=cs.',
  '',
  '## Glossary',
  '',
  '| English | Czech (required) |',
  '|---|---|',
  ...GLOSSARY_CS.map((g) => `| ${g.en.source.replace(/\|/g, '\\|')} | ${g.note} |`),
);

table('Services and tasks (the bar, the front page)');
for (const s of SERVICES) {
  row(`${s.name}: tagline`, s.tagline, s.cs.tagline);
  row(`${s.name}: description`, s.description, s.cs.description);
}
for (const t of TASKS) row(`Task ${t.service}/${t.page}`, `${t.title} — ${t.description}`, `${t.cs.title} — ${t.cs.description}`);
for (const [en, cs] of Object.entries(TABS_CS)) row('Tab label', en, cs);

table('Life situations: journeys and lights');
for (const j of JOURNEYS) {
  const c = JOURNEYS_CS[j.id];
  row(`${j.id}: title`, j.title, c.title);
  row(`${j.id}: description`, j.description, c.description);
  row(`${j.id}: steps`, j.stages.join(' · '), c.stages.join(' · '));
}
for (const [k, l] of Object.entries(LIGHTS)) row(`light ${k}`, `${l.label} — ${l.line}`, `${LIGHTS_CS[k as keyof typeof LIGHTS].label} — ${LIGHTS_CS[k as keyof typeof LIGHTS].line}`);

table('Life situations: questions and outcomes');
for (const [id, node] of Object.entries(NODES)) {
  const c = NODES_CS[id] as Record<string, never> & { title: string; lead: string };
  row(`${id}: title`, node.title, c.title);
  row(`${id}: lead`, node.lead, c.lead);
  if (node.kind === 'question') {
    const answers = (c as unknown as { answers: { label: string; hint?: string }[] }).answers;
    node.answers.forEach((a, i) => row(`${id}: answer ${i + 1}`, a.hint ? `${a.label} — ${a.hint}` : a.label, answers[i].hint ? `${answers[i].label} — ${answers[i].hint}` : answers[i].label));
  } else {
    const o = c as unknown as { steps: string[]; go: string[] };
    node.steps.forEach((s, i) => row(`${id}: step ${i + 1}`, s, o.steps[i]));
    node.go.forEach((g, i) => row(`${id}: button`, g.label, o.go[i]));
    for (const s of node.sources ?? []) row(`${id}: source`, s.label, SOURCES_CS[s.url]);
  }
}

console.log(out.join('\n'));
