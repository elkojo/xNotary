<!--
  The "I want to…" box (R1): a few words in, one or two journeys out. On the front page above the
  cards, and at the top of /situations/.

  Matching is src/site/intents.ts, in this page: nothing typed is stored or sent, and there is no
  AI. A suggestion opens a journey on /situations/ — at its first question, or at a question whose
  answers only choose a tool — never past a question that decides a legal route. With no match the
  cards below stay where they are, and the box says so.

  `?q=` fills the box on arrival, so an agent or a link can hand a reader over with their words
  already in it (docs/agents.md, E8). The page never writes what is typed into the address.
-->
<script lang="ts">
  import { pick, site } from './lang.svelte';
  import { SITUATIONS_HREF } from './services';
  import { suggest } from './intents';
  import { situationsIn, type NodeId } from './situations';

  let { onpick }: { onpick?: (target: NodeId) => void } = $props();

  let typed = $state(typeof location === 'undefined' ? '' : (new URLSearchParams(location.search).get('q') ?? ''));
  const suggestions = $derived(suggest(typed));
  const words = $derived(situationsIn(site.lang));

  const TEXT = {
    en: {
      label: 'I want to…',
      placeholder: 'e.g. a power of attorney for the land registry',
      find: 'Find',
      note: 'What you type is matched in this page. Nothing is sent or stored.',
      didYouMean: 'Did you mean',
      none: 'No match. Choose your situation below.',
    },
    cs: {
      label: 'Potřebuji…',
      placeholder: 'např. plná moc pro katastr',
      find: 'Najít',
      note: 'Co napíšete, se porovná přímo na této stránce. Nic se neodesílá ani neukládá.',
      didYouMean: 'Máte na mysli',
      none: 'Nic jsme nenašli. Vyberte svou situaci níže.',
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
</form>
