<!--
  /support/: a thank-you, and a way to support the project. Voluntary, always — nothing on the
  site waits for it, and the page cannot know whether anyone paid. It asks nobody: the Lightning
  QR was drawn at build time (vite.hub.config.ts), and a wallet that scans it talks to the
  payment service directly. Card, bank QR and sharing are shown, and say they are not built yet.
-->
<script lang="ts">
  import Info from '../src/site/Info.svelte';
  import SiteBar from '../src/site/SiteBar.svelte';
  import { LIGHTNING, lightningUri } from '../src/site/support';
  import HubFooter from './HubFooter.svelte';

  let menu = $state<'services' | 'tasks' | null>(null);
  let copy = $state<'idle' | 'copied' | 'failed'>('idle');

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(LIGHTNING);
      copy = 'copied';
      setTimeout(() => (copy = 'idle'), 2500);
    } catch {
      // No clipboard (an older browser, a refused permission): show the code to select instead.
      copy = 'failed';
    }
  }

  const SHARE = ['Copy link', 'Email', 'X', 'LinkedIn', 'Reddit'] as const;
</script>

{#snippet icon(name: string)}
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {#if name === 'lightning'}
      <path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6l1-8z" />
    {:else if name === 'card'}
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19M6 15h4" />
    {:else if name === 'bank'}
      <path d="M3 9.5L12 4l9 5.5M4.5 10v8M9 10v8M15 10v8M19.5 10v8M3 20.5h18" />
    {:else if name === 'Copy link'}
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path
        d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"
      />
    {:else if name === 'Email'}
      <rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6.5L20.5 7" />
    {:else if name === 'X'}
      <path d="M4.5 4h4l11 16h-4zM19.5 4l-6.2 7M4.5 20l6.2-7" />
    {:else if name === 'LinkedIn'}
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10.5V17M8 7.25v.01M12 17v-6.5M12 13.25c0-1.75 1-2.75 2.5-2.75S17 11.5 17 13.25V17" />
    {:else if name === 'Reddit'}
      <ellipse cx="12" cy="14.5" rx="7.5" ry="5" /><path d="M12 9.5l1.25-5 4 1M9.25 16.75c1.5 1 4 1 5.5 0" /><circle
        cx="18.5"
        cy="5.75"
        r="1.25"
      /><path d="M9.5 13.5v.01M14.5 13.5v.01" />
    {/if}
  </svg>
{/snippet}

<SiteBar bind:menu />

<main class="support-page">
  <div class="support-wrap">
    <p class="support-done">Thank you for using xNotary.digital.</p>

    <section class="support-card" aria-labelledby="support-title">
      <h1 id="support-title">Did it save you <mark class="hlm">time?</mark></h1>
      <p class="support-lede">You can support the work with a payment.</p>

      <div class="choice-row support-methods" role="group" aria-label="Payment method">
        <button type="button" class="choice selected" aria-pressed="true">
          {@render icon('lightning')} Lightning
        </button>
        <span class="method-soon">
          <button type="button" class="choice" disabled>{@render icon('card')} Card</button><Info
            label="About card payment">Under development.</Info
          >
        </span>
        <span class="method-soon">
          <button type="button" class="choice" disabled>{@render icon('bank')} Bank QR</button><Info
            label="About bank QR payment">Under development.</Info
          >
        </span>
      </div>

      <div class="lightning">
        <div class="lightning-qr" role="img" aria-label="QR code for a Lightning payment">
          <!-- An SVG this build drew from a constant, never input. -->
          {@html __LIGHTNING_QR__}
        </div>
        <div class="lightning-text">
          <h2>Pay with Lightning</h2>
          <p>
            Scan the code with a Lightning wallet and choose the amount there.<Info
              label="About Lightning payment"
              >The code points your wallet at the project's Lightning address, and your wallet
              talks to it directly. This page sends nothing, and cannot see whether you paid.</Info
            >
          </p>
          <div class="action-group">
            <a class="button dark" href={lightningUri(LIGHTNING)}>Open in wallet</a>
            <button type="button" class="button secondary" onclick={() => void copyCode()}>
              {copy === 'copied' ? 'Copied' : 'Copy code'}
            </button>
          </div>
          {#if copy === 'failed'}
            <label class="lightning-code">
              <span>Copying is not available here. Select the code:</span>
              <input class="input" readonly value={LIGHTNING} onfocus={(e) => e.currentTarget.select()} />
            </label>
          {/if}
        </div>
      </div>
    </section>

    <div class="support-share">
      <span class="share-label">Share xNotary.digital<Info label="About sharing">Under development.</Info></span>
      <div class="share-icons">
        {#each SHARE as name}
          <button type="button" class="share-icon" disabled aria-label={name} title={name}>
            {@render icon(name)}
          </button>
        {/each}
      </div>
    </div>
  </div>
</main>

<HubFooter />
