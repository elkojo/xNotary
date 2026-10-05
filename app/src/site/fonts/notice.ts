import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The notice for the site's text face, for the build configs that generate THIRD-PARTY.txt. */
export function fontNotice(): { name: string; version: string; license: string; text: string; note: string } {
  return {
    name: 'Inter',
    version: '4.1, subset (see app/src/site/fonts/README.md)',
    license: 'OFL-1.1',
    text: readFileSync(fileURLToPath(new URL('./OFL.txt', import.meta.url)), 'utf8').trim(),
    note: 'The text face of these pages, served from this site.',
  };
}

/** The same notice as plain text, in the shape the notices files use. */
export function fontNoticeText(rule = '-'.repeat(78)): string {
  const n = fontNotice();
  return [rule, `${n.name} ${n.version} — ${n.license}`, '', n.note, '', n.text].join('\n');
}
