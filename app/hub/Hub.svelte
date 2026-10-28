<script lang="ts">
  import SiteBar from '../src/site/SiteBar.svelte';
  import { SERVICES, SITUATIONS_HREF } from '../src/site/services';
  import { JOURNEYS } from '../src/site/situations';
  import HubFooter from './HubFooter.svelte';

  let menu = $state<'services' | 'tasks' | null>(null);
</script>

<SiteBar bind:menu />

<main>
  <section class="home hub">
    <div class="home-wrap">
      <div class="hero">
        <div class="eyebrow">Independent document tools</div>
        <h1>What do you need to <mark class="hlm">do?</mark></h1>
        <p>Choose your situation. A few questions lead to the tool that does it — or to what to ask first.</p>
      </div>

      <!--
        Situations first, tools second: a first-time visitor should not have to know which of
        the services does what before starting (UX test, 2026-10). Each card opens its journey
        on /situations/.
      -->
      <div class="situation-grid hub-situations">
        {#each JOURNEYS as j, i}
          <a class="situation-card" class:lead={i === 0} href={`${SITUATIONS_HREF}#${j.id}`}>
            <strong>{j.title}</strong>
            <span>{j.description}</span>
          </a>
        {/each}
      </div>

      <h2 class="hub-tools-head">Or go straight to a tool</h2>
      <div class="product-grid">
        {#each SERVICES as s}
          <a class="product-card" href={s.href}>
            <div class="top">
              <span class="brand-mark"><span>{s.mark}</span></span>
              <h2>{s.name}</h2>
              <span class="kicker" aria-hidden="true">↗</span>
            </div>
            <p>{s.description}</p>
            <div class="pages">
              {#each s.tabs.slice(0, 4) as tab}
                <span class="chip">{tab.label}</span>
              {/each}
            </div>
          </a>
        {/each}
        <div class="product-card soon">
          <div class="top">
            <span class="brand-mark"><span>+</span></span>
            <h2>More services</h2>
          </div>
          <p>Next, perhaps: remote multiparty agreements.</p>
        </div>
      </div>

      <div class="trust-row">
        <span>No document upload</span>
        <span>No account</span>
        <span>No backend</span>
        <span>Open source</span>
      </div>
    </div>
  </section>
</main>

<HubFooter />
