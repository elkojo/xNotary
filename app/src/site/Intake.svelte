<!--
  The "I want to…" box (R1): a few words in, one or two journeys out. On the front page above the
  cards, and at the top of /situations/.

  Matching is src/site/intents.ts, in this page: nothing typed is stored or sent, and there is no
  AI. A suggestion opens a journey on /situations/ — at its first question, or at a question whose
  answers only choose a tool — never past a question that decides a legal route. With no match the
  cards below stay where they are, and the box says so.

  `?q=` fills the box on arrival, so an agent or a link can hand a reader over with their words
  already in it (docs/agents.md, E8). The page never writes what is typed into the address.

  "Ask your own AI" copies a question for the reader's assistant (ask-ai.ts) to the clipboard. It
  opens nothing and sends nothing: pasting it somewhere is the reader's own act.
-->
<script lang="ts">
  import Fresh from './Fresh.svelte';
  import Info from './Info.svelte';
  import { AI_HREF } from './ai-install';
  import { askAiPrompt } from './ask-ai';
  import { pick, site } from './lang.svelte';
  import { SITUATIONS_HREF } from './services';
  import { suggest } from './intents';
  import { situationsIn, type NodeId } from './situations';

  let { onpick }: { onpick?: (target: NodeId) => void } = $props();

  let typed = $state(typeof location === 'undefined' ? '' : (new URLSearchParams(location.search).get('q') ?? ''));
  const suggestions = $derived(suggest(typed));
  const words = $derived(situationsIn(site.lang));

  /** "Ask your own AI": idle, copied, or shown for copying by hand when the clipboard refuses. */
  let asked = $state<'idle' | 'copied' | 'manual'>('idle');
  const prompt = $derived(askAiPrompt(typed, typeof location === 'undefined' ? 'https://xnotary.digital' : location.origin, site.lang));
  $effect(() => {
    typed; // a new question starts afresh
    asked = 'idle';
  });
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      asked = 'copied';
    } catch {
      asked = 'manual';
    }
  }

  const TEXT = {
    en: {
      label: 'I want to…',
      placeholder: 'e.g. a power of attorney for the land registry',
      find: 'Find',
      note: 'What you type is matched in this page. Nothing is sent or stored.',
      didYouMean: 'Did you mean',
      none: 'No match. Choose your situation below.',
      ask: 'Ask your own AI',
      copied: 'Copied — paste it into your AI assistant',
      askInfo:
        'Copies your words as a question for Claude, ChatGPT or another assistant, with a link to this site’s rules, so it answers from the same knowledge base. Nothing is sent: you paste it yourself, or not.',
      manual: 'Copy this into your AI assistant:',
      always: 'Use it every time →',
    },
    cs: {
      label: 'Potřebuji…',
      placeholder: 'např. plná moc pro katastr',
      find: 'Najít',
      note: 'Co napíšete, se porovná přímo na této stránce. Nic se neodesílá ani neukládá.',
      didYouMean: 'Máte na mysli',
      none: 'Nic jsme nenašli. Vyberte svou situaci níže.',
      ask: 'Zeptat se svého AI',
      copied: 'Zkopírováno — vložte to do svého AI asistenta',
      askInfo:
        'Zkopíruje vaše slova jako dotaz pro Claude, ChatGPT nebo jiného asistenta, s odkazem na pravidla tohoto webu, aby odpovídal ze stejné znalostní báze. Nic se neodesílá: vložíte to sami, nebo ne.',
      manual: 'Zkopírujte to do svého AI asistenta:',
      always: 'Používat pokaždé →',
    },
  };
  const t = $derived(pick(TEXT));

  /** The journey's name, and the step's own name when the suggestion starts further in. */
  function labelFor(target: NodeId, journey: string): string {
    const j = words.journeys.find((x) => x.id === journey)!;
    return target === j.first ? j.title : `${j.title}: ${words.nodes[target].title}`;
  }

  function go(target: NodeId) {
    if (onpick) onpick(target);
    else location.assign(`${SITUATIONS_HREF}#${target}`);
  }
</script>

<form
  class="intake"
  role="search"
  onsubmit={(e) => {
    e.preventDefault();
    if (suggestions[0]) go(suggestions[0].target);
  }}
>
  <label class="intake-label" for="intake-input">{t.label}</label>
  <div class="intake-row">
    <input
      id="intake-input"
      class="input"
      name="intent"
      type="search"
      autocomplete="off"
      enterkeyhint="go"
      placeholder={t.placeholder}
      bind:value={typed}
    />
    <button class="button dark" type="submit" disabled={!suggestions.length}>{t.find}</button>
  </div>
  <p class="intake-note">{t.note}</p>
  <!-- Rebuilt, not updated, as the suggestions change: see Fresh.svelte for why. -->
  <div aria-live="polite">
    {#if typed.trim()}
      {#key suggestions.map((s) => s.target).join() + site.lang}
        {#if suggestions.length}
          <div class="intake-suggestions">
            <span>{t.didYouMean}</span>
            {#each suggestions as s, i}
              <a
                class:lead={i === 0}
                href={`${SITUATIONS_HREF}#${s.target}`}
                onclick={(e) => {
                  if (!onpick) return;
                  e.preventDefault();
                  go(s.target);
                }}>{labelFor(s.target, s.journey)}</a
              >
            {/each}
          </div>
        {:else}
          <p class="intake-none">{t.none}</p>
        {/if}
      {/key}
    {/if}
  </div>
  {#if typed.trim()}
    <div class="intake-ask">
      <button class="link-button" type="button" onclick={copyPrompt}
        ><Fresh text={asked === 'copied' ? t.copied : t.ask} /></button
      ><Info>{t.askInfo}</Info>
      {#if asked === 'copied'}<a href={AI_HREF}>{t.always}</a>{/if}
    </div>
    {#if asked === 'manual'}
      <label class="intake-manual"
        >{t.manual}
        <textarea class="input" readonly rows="6" translate="no" onfocus={(e) => e.currentTarget.select()}>{prompt}</textarea>
      </label>
    {/if}
  {/if}
</form>
