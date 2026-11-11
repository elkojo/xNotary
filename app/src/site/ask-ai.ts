/**
 * "Ask your own AI" (beside the "I want to…" box): the reader's words, turned into a question
 * for whichever assistant they use — Claude, ChatGPT or another — that points it at this site's
 * rules, so it answers from the same decision engine as the page and with the same limits.
 *
 * It is copied to the clipboard, never sent: the page opens no assistant and puts nothing typed in
 * an address, where it would sit in a third party's logs. The reader pastes it, or does not.
 * `origin` is where the page runs, so a beta page points to the beta's rules.
 */
import type { Lang } from './lang.svelte';

export function askAiPrompt(typed: string, origin: string, lang: Lang): string {
  const words = typed.trim().replace(/\s+/g, ' ');
  const rules = `${origin}/situations/rules.json`;
  const guide = `${origin}/llms.txt`;
  return lang === 'cs'
    ? [
        `Potřebuji: ${words}`,
        '',
        `Poraď mi podle pravidel xNotary.digital: ${rules} (návod pro AI: ${guide}).`,
        'Projdi se mnou otázky mé situace jednu po druhé, jak je pravidla kladou, a žádnou nepřeskakuj.',
        'Na konci uveď výsledek s jeho semaforem, zdroji a datem, kdy byly ověřeny.',
        'Je to informace, ne právní rada. Nic za mě nepodepisuj, neodesílej ani neschvaluj.',
        'Odpovídej česky.',
      ].join('\n')
    : [
        `I want to: ${words}`,
        '',
        `Advise me from the xNotary.digital rules: ${rules} (guide for AI assistants: ${guide}).`,
        'Walk me through the questions for my situation one at a time, as the rules ask them, and skip none.',
        'End with the outcome, its traffic light, its sources and the date they were checked.',
        'This is information, not legal advice. Do not sign, send or approve anything for me.',
      ].join('\n');
}
