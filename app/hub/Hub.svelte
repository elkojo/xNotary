<script lang="ts">
  import SiteBar from '../src/site/SiteBar.svelte';
  import { SERVICES } from '../src/site/services';

  const SOURCE_URL = 'https://github.com/elkojo/xNotary';
  const revision = __APP_REVISION__;
  const commit = __APP_COMMIT__;
  const revisionUrl =
    commit && !revision.endsWith('-dirty') ? `${SOURCE_URL}/tree/${commit}` : null;

  let menu = $state<'services' | 'tasks' | null>(null);
</script>

<SiteBar bind:menu />

<main>
  <section class="home hub">
    <div class="home-wrap">
      <div class="hero">
        <div class="eyebrow">Independent document tools</div>
        <h1>Documents you can <mark class="hlm">prove.</mark></h1>
        <p>Free tools that work on your document in this browser. Every result checks without us.</p>
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

<footer class="site">
  <div>
    <div class="family-links">
      {#each SERVICES as s}
        <a href={s.href}>{s.name}{s.external ? ' ↗' : ''}</a>
      {/each}
    </div>
    Your documents never leave your device. Free and open source under the
    <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">
      AGPL-3.0</a
    >{#if revisionUrl}, built from
      <a href={revisionUrl} target="_blank" rel="noopener noreferrer"
        ><span class="mono">{revision}</span></a
    >{/if}.<a href="/THIRD-PARTY.txt">Third-party code</a>. Not legal advice.
  </div>
</footer>
