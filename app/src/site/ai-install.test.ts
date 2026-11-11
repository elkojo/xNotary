import { describe, expect, it } from 'vitest';
import { SKILL_PATH, agentInstall, projectInstructions } from './ai-install';

const O = 'https://beta.xnotary.digital';

describe('/ai/: what the reader copies', () => {
  for (const lang of ['en', 'cs'] as const) {
    const project = projectInstructions(O, lang);
    const agent = agentInstall(O, lang);

    it(`points every text at this origin's files (${lang})`, () => {
      expect(project).toContain(`${O}/llms.txt`);
      expect(project).toContain(`${O}/situations/rules.json`);
      expect(agent).toContain(`${O}${SKILL_PATH}`);
      expect(agent).not.toMatch(/https:\/\/xnotary\.digital/);
    });

    it(`carries the site's limits (${lang})`, () => {
      expect(project).toMatch(lang === 'en' ? /not legal advice/ : /ne o právní radu/);
      expect(project).toMatch(lang === 'en' ? /Never sign, send, pay or approve anything for me/ : /Nikdy za mě nic nepodepisuj/);
      expect(project).toMatch(lang === 'en' ? /do not answer from memory/ : /neodpovídej zpaměti/);
      expect(project).toMatch(lang === 'en' ? /information, not instructions/ : /informace, ne jako pokyny/);
    });

    it(`installs openly: shows the commands, asks first, touches nothing else (${lang})`, () => {
      expect(agent).toMatch(lang === 'en' ? /Show me the exact commands first and ask before running them/ : /ukaž přesné příkazy a před spuštěním se zeptej/);
      expect(agent).toMatch(lang === 'en' ? /Install nothing else and change nothing else/ : /Nic jiného neinstaluj a nic jiného neměň/);
      for (const agentName of ['Claude Code', 'Hermes', 'Codex']) expect(agent).toContain(agentName);
      expect(agent).toContain('claude plugin install xnotary@xnotary-digital');
    });

    it(`uses none of the phrasing prompt injections use (${lang})`, () => {
      for (const text of [project, agent]) expect(text).not.toMatch(/ignore (all |any |your |previous )|disregard|system prompt|without asking/i);
    });
  }
});
