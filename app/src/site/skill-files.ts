/**
 * The Agent Skill as the site serves it (/ai/): the SKILL.md alone, which Hermes installs from a
 * URL and Codex or any agent saves into its skills folder, and a zip with one `xnotary/` folder,
 * which claude.ai and ChatGPT take as an upload.
 *
 * The zip also carries `xnotary/rules.json`, the same bytes as /situations/rules.json from the same
 * build. Chat assistants run skills in a sandbox that usually cannot reach this site, so without it
 * the skill could only say it has no rules. With it, the skill answers from the rules of the
 * release it came with, says which release, and still prefers the live file when it can read it.
 */
import { SKILL_PATH, SKILL_ZIP_PATH } from './ai-install';
import { rules } from './situations-export';
import { zip } from './zip';

type Meta = { version: string; build: string };

/** /situations/rules.json, exactly as served: the zip's copy is built from this too. */
export function rulesJson(meta: Meta): string {
  return JSON.stringify(rules(meta), null, 1) + '\n';
}

export function skillFiles(skill: Uint8Array, meta: Meta): Record<string, Uint8Array> {
  return {
    [SKILL_PATH]: skill,
    [SKILL_ZIP_PATH]: zip([
      { path: 'xnotary/SKILL.md', data: skill },
      { path: 'xnotary/rules.json', data: new TextEncoder().encode(rulesJson(meta)) },
    ]),
  };
}
