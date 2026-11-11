import { describe, expect, it } from 'vitest';
import { askAiPrompt } from './ask-ai';

describe('"Ask your own AI"', () => {
  const en = askAiPrompt('  plná  moc pro katastr ', 'https://beta.xnotary.digital', 'en');
  const cs = askAiPrompt('plná moc pro katastr', 'https://xnotary.digital', 'cs');

  it("carries the reader's words as they typed them, tidied", () => {
    expect(en.split('\n')[0]).toBe('I want to: plná moc pro katastr');
    expect(cs.split('\n')[0]).toBe('Potřebuji: plná moc pro katastr');
  });

  it('points the assistant at the rules of the site it was copied from', () => {
    expect(en).toContain('https://beta.xnotary.digital/situations/rules.json');
    expect(en).toContain('https://beta.xnotary.digital/llms.txt');
    expect(cs).toContain('https://xnotary.digital/situations/rules.json');
  });

  it('asks for the same answer the page gives, with its limits', () => {
    expect(en).toMatch(/skip none/);
    expect(en).toMatch(/traffic light, its sources and the date/);
    expect(en).toMatch(/not legal advice\. Do not sign, send or approve anything for me/);
    expect(cs).toMatch(/žádnou nepřeskakuj/);
    expect(cs).toMatch(/semaforem, zdroji a datem/);
    expect(cs).toMatch(/ne právní rada\. Nic za mě nepodepisuj, neodesílej ani neschvaluj/);
  });
});
