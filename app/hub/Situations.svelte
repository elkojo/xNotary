<!--
  /situations/: "Start from your situation". A few questions, one at a time, then the tool that
  does the next step — or, as often, what to ask somebody first. The content is data in
  src/site/situations.ts, where its limits are tested; this only walks it.

  The answers stay in this page: nothing is sent and nothing is stored. A journey can be opened
  directly as /situations/#sign (or #official, #proof, #check).
-->
<script lang="ts">
  import Info from '../src/site/Info.svelte';
  import SiteBar from '../src/site/SiteBar.svelte';
  import Stepper from '../src/site/Stepper.svelte';
  import { TASKS, pageHref } from '../src/site/services';
  import { JOURNEYS, NODES, journeyOf, stageOf, type NodeId } from '../src/site/situations';
  import HubFooter from './HubFooter.svelte';

  let menu = $state<'services' | 'tasks' | null>(null);
  /** The questions answered so far, and where they led; the last is on screen. */
  let path = $state<NodeId[]>(fromHash());

  /** `#sign` and the like open that journey — on arrival, and when the hash changes later. */
  function fromHash(): NodeId[] {
    const journey = JOURNEYS.find((j) => `#${j.id}` === location.hash);
    return journey ? [journey.first] : [];
  }
  $effect(() => {
    const open = () => (path = fromHash());
    addEventListener('hashchange', open);
    return () => removeEventListener('hashchange', open);
  });

  const here = $derived(path.at(-1) ?? null);
  const node = $derived(here ? NODES[here] : null);
  const journey = $derived(here ? journeyOf(here) : null);

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
        <h1>What do you need to do?</h1>
        <p>A few questions, then the right tool — or what to ask first.</p>
      </div>
      <span class="secure-note"
        >Nothing is sent<Info>Your answers stay in this page. Nothing is sent and nothing is stored.</Info></span
      >
    </div>

    {#if !node || !journey}
      <div class="situation-grid">
        {#each JOURNEYS as j, i}
          <button class="situation-card" class:lead={i === 0} type="button" onclick={() => begin(j.first)}>
            <strong>{j.title}</strong>
            <span>{j.description}</span>
          </button>
        {/each}
      </div>

      <h2 class="situations-other">Something else</h2>
      <div class="situation-links">
        {#each others as task}
          <a href={pageHref(task.service, task.page)}>{task.title}</a>
        {/each}
      </div>
    {:else}
      <div class="flow-shell">
        <div class="flow-main">
          <Stepper steps={[...journey.stages]} current={stageOf(here!) + 1} />

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
              <span class="pill" class:good={!node.status.warn} class:waiting={node.status.warn}>{node.status.text}</span>
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
            {/if}

            <div class="situation-nav">
              <button class="link-button" type="button" onclick={() => (path = path.slice(0, -1))}>Back</button>
              <button class="link-button" type="button" onclick={() => (path = [])}>Start over</button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <p class="situations-foot">
      Document tools and guidance, not notarial services or legal advice. What a recipient accepts
      depends on the country, the document and the recipient.
    </p>
  </div>
</main>

<HubFooter />
