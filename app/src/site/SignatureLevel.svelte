<!--
  A signature's level, as every service on the site shows it: three steps, a plain name, one
  line saying what the certificate says, and — visibly, never only in the bubble — that this was
  read from the certificate rather than checked. See signature-level.ts.

  `compact` is the one-line form for a list (xNotary's signer cards); a screen using it must
  carry the not-checked sentence itself, once, next to the list.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Info from './Info.svelte';
  import { LEVELS, NOT_CHECKED, signatureLevel } from './signature-level';

  interface Props {
    qualified: boolean;
    onQualifiedDevice: boolean;
    compact?: boolean;
    /** Further sentences for this screen, shown under the line. */
    children?: Snippet;
    /** Further detail for this screen, at the end of the bubble. */
    more?: Snippet;
  }

  let { qualified, onQualifiedDevice, compact = false, children, more }: Props = $props();

  const level = $derived(LEVELS[signatureLevel({ qualified, onQualifiedDevice })]);
</script>

{#snippet marks()}
  <span class="level-marks" aria-hidden="true">
    {#each [1, 2, 3] as step}<span class:on={step <= level.rank}></span>{/each}
  </span>
{/snippet}

{#snippet bubble()}
  A certificate can state that it is qualified, and that its key is kept on a certified signing
  device such as a card or token. Whether that is true is decided against the trust list of the
  framework it was issued under: your PDF reader can check it, this page does not. {level.eu}
  {@render more?.()}
{/snippet}

{#if compact}
  <span class="level-compact">
    {@render marks()}<span>{level.title}</span><Info label="About this signature level"
      >{level.line} {@render bubble()}</Info
    >
  </span>
{:else}
  <div class="notice signature-level">
    <div class="level-head">
      {@render marks()}<strong>{level.title}</strong>
    </div>
    <div>{level.line}</div>
    {#if children}<div>{@render children()}</div>{/if}
    <div class="level-limit">
      {NOT_CHECKED}<Info label="About this signature level">{@render bubble()}</Info>
    </div>
  </div>
{/if}
