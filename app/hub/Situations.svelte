<!--
  /situations/: "Start from your situation". A few questions, one at a time, then the tool that
  does the next step — or, as often, what to ask somebody first. The content is data in
  src/site/situations.ts, where its limits are tested; this only walks it.

  The answers stay in this page: nothing is sent and nothing is stored. A journey can be opened
  directly as /situations/#sign (any journey id), and a single step as /situations/#sign-nocert
  (any node id) — which is how xSignature points a reader without a certificate here.
-->
<script lang="ts">
  import Info from '../src/site/Info.svelte';
  import SiteBar from '../src/site/SiteBar.svelte';
  import Stepper from '../src/site/Stepper.svelte';
  import { pick, site } from '../src/site/lang.svelte';
  import { TASKS, pageHref } from '../src/site/services';
  import { JOURNEYS, NODES, journeyOf, situationsIn, stageOf, type NodeId } from '../src/site/situations';
  import HubFooter from './HubFooter.svelte';

  let menu = $state<'services' | 'tasks' | null>(null);
  /** The questions answered so far, and where they led; the last is on screen. */
  let path = $state<NodeId[]>(fromHash());

  /**
   * `#sign` and the like open that journey; `#sign-nocert` and the like open that very step —
   * on arrival, and when the hash changes later.
   */
  function fromHash(): NodeId[] {
    const id = decodeURIComponent(location.hash.slice(1));
    const journey = JOURNEYS.find((j) => j.id === id);
    if (journey) return [journey.first];
    return id in NODES ? [id] : [];
  }
  $effect(() => {
    const open = () => (path = fromHash());
    addEventListener('hashchange', open);
    return () => removeEventListener('hashchange', open);
  });

  /** The same graph in the chosen language (situations.ts, situations.cs.ts). */
  const words = $derived(situationsIn(site.lang));
  const here = $derived(path.at(-1) ?? null);
  const node = $derived(here ? words.nodes[here] : null);
  const journey = $derived(here ? words.journeys.find((j) => j.id === journeyOf(here).id)! : null);

  const TEXT = {
    en: {
      title: 'What do you need to do?',
      intro: 'A few questions, then the right tool — or what to ask first.',
      nothingSent: 'Nothing is sent',
      nothingSentInfo: 'Your answers stay in this page. Nothing is sent and nothing is stored.',
      other: 'Something else',
      back: 'Back',
      startOver: 'Start over',
      sources: 'Sources',
      checked: 'checked',
      notAdvice: 'Information, not legal advice. Rules change; the recipient has the last word.',
      foot: 'Document tools and guidance, not notarial services or legal advice. What a recipient accepts depends on the country, the document and the recipient.',
    },
    cs: {
      title: 'Co potřebujete vyřídit?',
      intro: 'Pár otázek a pak správný nástroj — nebo na co se nejdřív zeptat.',
      nothingSent: 'Nic se neodesílá',
      nothingSentInfo: 'Odpovědi zůstávají na této stránce. Nic se neodesílá ani neukládá.',
      other: 'Něco jiného',
      back: 'Zpět',
      startOver: 'Začít znovu',
      sources: 'Zdroje',
      checked: 'ověřeno',
      notAdvice: 'Informace, ne právní rada. Pravidla se mění; poslední slovo má příjemce.',
      foot: 'Nástroje pro dokumenty a orientace v nich, ne notářské služby ani právní poradenství. Co příjemce přijme, záleží na zemi, na dokumentu a na příjemci.',
    },
  };
  const t = $derived(pick(TEXT));
  $effect(() => {
    document.documentElement.lang = site.lang;
  });

  /** Covered by a journey's outcome; the rest are listed under "Something else". */
  const routed = new Set(['xsignature/document', 'xsignature/signature', 'xsignature/check', 'xnotary/notarize', 'xnotary/verify']);
  const others = TASKS.filter((t) => !routed.has(`${t.service}/${t.page}`));

  function begin(id: NodeId) {
    path = [id];
  }
</script>

<SiteBar bind:menu />

<main class="product-view situations">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>{t.title}</h1>
        <p>{t.intro}</p>
      </div>
      <span class="secure-note"
        >{t.nothingSent}<Info>{t.nothingSentInfo}</Info></span
      >
    </div>

    {#if !node || !journey}
      <div class="situation-grid">
        {#each words.journeys as j, i}
          <button class="situation-card" class:lead={i === 0} type="button" onclick={() => begin(j.first)}>
            <strong>{j.title}</strong>
            <span>{j.description}</span>
          </button>
        {/each}
      </div>

      <h2 class="situations-other">{t.other}</h2>
      <div class="situation-links">
        {#each others as task}
          <a href={pageHref(task.service, task.page)}>{site.lang === 'cs' ? task.cs.title : task.title}</a>
        {/each}
      </div>
    {:else}
      <div class="flow-shell">
        <div class="flow-main">
          <!-- Per journey, for the same reason as the panel below: an answer can lead into another one. -->
          {#key journey.id}
            <Stepper steps={[...journey.stages]} current={stageOf(here!) + 1} />
          {/key}

          <!--
            Rebuilt for every step, not updated in place. A browser translator (Chrome's, Edge's)
            swaps the page's text nodes for its own; text Svelte then updates in place changes in
            nodes nobody sees, and the old question stays on screen beside the new answers.
            Fresh elements are translated afresh.
          -->
          {#key here}
          <div class="flow-panel">
            <div class="situation-journey">{journey.title}</div>
            {#if node.kind === 'question'}
              <h2 class="panel-title">{node.title}</h2>
              <p class="panel-copy">{node.lead}</p>
              <div class="answer-list">
                {#each node.answers as answer}
                  <button class="answer" type="button" onclick={() => (path = [...path, answer.next])}>
                    <strong>{answer.label}</strong>
                    {#if answer.hint}<span>{answer.hint}</span>{/if}
                  </button>
                {/each}
              </div>
            {:else}
              <div class="situation-light">
                <span
                  class="pill"
                  class:good={node.light === 'online'}
                  class:waiting={node.light === 'assisted'}
                  class:bad={node.light === 'in-person'}>{words.lights[node.light].label}</span
                ><span>{words.lights[node.light].line}</span>
              </div>
              <h2 class="panel-title">{node.title}</h2>
              <p class="panel-copy">{node.lead}</p>
              <ol class="outcome-steps">
                {#each node.steps as step}<li>{step}</li>{/each}
              </ol>
              {#if node.go.length}
                <div class="action-group">
                  {#each node.go as go, i}
                    <a class="button small {i === 0 ? 'dark' : 'ghost-dark'}" href={pageHref(go.service, go.page)}>{go.label}</a>
                  {/each}
                </div>
              {/if}
              {#if node.sources?.length}
                <!-- The rules this rests on, as published by those who make them, and when we read them. -->
                <div class="situation-sources">
                  <strong>{t.sources}</strong>, {t.checked} {node.checked}:
                  <ul>
                    {#each node.sources as source}
                      <li><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>
                    {/each}
                  </ul>
                  {t.notAdvice}
                </div>
              {/if}
            {/if}

            <div class="situation-nav">
              <button class="link-button" type="button" onclick={() => (path = path.slice(0, -1))}>{t.back}</button>
              <button class="link-button" type="button" onclick={() => (path = [])}>{t.startOver}</button>
            </div>
          </div>
          {/key}
        </div>
      </div>
    {/if}

    <p class="situations-foot">
      {t.foot}
    </p>
  </div>
</main>

<HubFooter />
