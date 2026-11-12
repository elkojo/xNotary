import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SKILL_PATH, SKILL_ZIP_PATH } from './ai-install';
import { rulesJson, skillFiles } from './skill-files';
import { unzip } from './zip.test-helper';

describe('the skill as the site serves it', () => {
  const skill = new Uint8Array(readFileSync(new URL('../../../agent/skills/xnotary/SKILL.md', import.meta.url)));
  const meta = { version: '0.11.0', build: 'v0.11.0' };
  const files = skillFiles(skill, meta);

  it('serves SKILL.md as it is in agent/skills', () => {
    expect(Buffer.from(files[SKILL_PATH]).equals(Buffer.from(skill))).toBe(true);
  });

  it('zips the skill with the rules of the same build, byte for byte as /situations/rules.json', () => {
    const inside = unzip(files[SKILL_ZIP_PATH]);
    expect(Object.keys(inside).sort()).toEqual(['xnotary/SKILL.md', 'xnotary/rules.json']);
    expect(inside['xnotary/SKILL.md']).toBe(new TextDecoder().decode(skill));
    expect(inside['xnotary/rules.json']).toBe(rulesJson(meta));
    expect(JSON.parse(inside['xnotary/rules.json'])).toMatchObject({ format: 1, version: '0.11.0' });
  });

  it('tells the agent when to use the copy beside it, and to say which release it is', () => {
    const text = new TextDecoder().decode(skill);
    expect(text).toMatch(/`rules\.json` beside this file/);
    expect(text).toMatch(/front page/);
    expect(text).toMatch(/`version`/);
  });
});
