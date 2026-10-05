<!--
  The 1 · 2 · 3 progress line above a flow. An ordered list, not buttons: the steps
  cannot be clicked, and disabled buttons read to a screen reader as three dimmed
  controls with no current one. `aria-current="step"` names the current one.

  When the step changes, focus moves to the new panel's heading. Otherwise the
  control that was just used (a drop zone, a button) is removed from the page and
  focus falls back to <body>, and nothing tells a screen-reader user that anything
  happened.
-->
<script lang="ts">
  import { tick } from 'svelte';

  let { steps, current }: { steps: string[]; current: number } = $props();

  let list: HTMLOListElement;
  let first = true;

  $effect(() => {
    void current;
    if (first) {
      first = false;
      return;
    }
    void tick().then(() => {
      const heading = list?.closest('.flow-main')?.querySelector<HTMLElement>('.flow-panel h2');
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
  });
</script>

<ol class="stepper" aria-label="Steps" bind:this={list}>
  {#each steps as label, i}
    {@const n = i + 1}
    <li class="step" class:active={current === n} class:done={current > n} aria-current={current === n ? 'step' : undefined}>
      {n} {label}{#if current > n}<span class="visually-hidden"> (done)</span>{/if}
    </li>
  {/each}
</ol>
