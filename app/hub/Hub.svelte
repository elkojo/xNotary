<script lang="ts">
  import SiteBar from '../src/site/SiteBar.svelte';
  import { SERVICES } from '../src/site/services';
  import HubFooter from './HubFooter.svelte';

  let menu = $state<'services' | 'tasks' | null>(null);
</script>

<SiteBar bind:menu />

<main>
  <section class="home hub">
    <div class="home-wrap">
      <div class="hero">
        <div class="eyebrow">Independent document tools</div>
        <h1>Documents you can <mark class="hlm">prove.</mark></h1>
        <p>Tools that respect your freedom and work on your document in your browser.</p>
        <p class="hint">
          Not sure which tool?
          <button
            onclick={(e) => {
              e.stopPropagation();
              scrollTo({ top: 0 });
              menu = 'tasks';
            }}>Start from what you want to do</button
          >
        </p>
      </div>

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
