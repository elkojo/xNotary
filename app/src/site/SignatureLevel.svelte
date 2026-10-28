<!--
  A signature's level, as every service on the site shows it: three steps, a plain name, one
  line saying what the certificate says, and — visibly, never only in the bubble — that this was
  read from the certificate rather than checked. See signature-level.ts.

  `compact` is the one-line form for a list (xNotary's signer cards); a screen using it must
  carry the not-checked sentence itself, once, next to the list.

  `certificate={false}` is the step below the three: no certificate signed the document. The
  marks stay empty, and there is no not-checked line, because nothing was read.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Info from './Info.svelte';
  import { LEVELS, NOT_CHECKED, NO_CERTIFICATE, signatureLevel } from './signature-level';

  interface Props {
    qualified?: boolean;
    onQualifiedDevice?: boolean;
    /** False when no certificate signed the document at all. */
    certificate?: boolean;
    compact?: boolean;
    /** Further sentences for this screen, shown under the line. */
    children?: Snippet;
    /** Further detail for this screen, at the end of the bubble. */
    more?: Snippet;
  }

  let { qualified = false, onQualifiedDevice = false, certificate = true, compact = false, children, more }: Props =
    $props();

  const level = $derived(certificate ? LEVELS[signatureLevel({ qualified, onQualifiedDevice })] : NO_CERTIFICATE);
</script>

{#snippet marks()}
  <span class="level-marks" aria-hidden="true">
    {#each [1, 2, 3] as step}<span class:on={step <= level.rank}></span>{/each}
  </span>
{/snippet}

{#snippet bubble()}
  {#if certificate}
    A certificate can state that it is qualified, and that its key is kept on a certified signing
    device such as a card or token. Whether that is true is decided against the trust list of the
    framework it was issued under: your PDF reader can check it, this page does not. {'eu' in level
      ? level.eu
      : ''}
  {:else}
    A picture of a signature can be put on any document by anyone who has the image, and a
    timestamp dates a file without naming anyone. Only a signature made with a certificate ties the
    document to whoever holds its key.
  {/if}
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
    <div>
      {level.line}{#if !certificate}<Info label="About this signature level">{@render bubble()}</Info>{/if}
    </div>
    {#if children}<div>{@render children()}</div>{/if}
    {#if certificate}
      <div class="level-limit">
        {NOT_CHECKED}<Info label="About this signature level">{@render bubble()}</Info>
      </div>
    {/if}
  </div>
{/if}
