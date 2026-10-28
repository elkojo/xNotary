<script lang="ts">
  import SiteBar from '../src/site/SiteBar.svelte';
  import { pick, site } from '../src/site/lang.svelte';
  import { SERVICES, SITUATIONS_HREF, TABS_CS } from '../src/site/services';
  import { situationsIn } from '../src/site/situations';
  import HubFooter from './HubFooter.svelte';

  let menu = $state<'services' | 'tasks' | null>(null);

  const TEXT = {
    en: {
      eyebrow: 'Independent document tools',
      lead: 'What do you need to',
      mark: 'do?',
      intro: 'Choose your situation. A few questions lead to the tool that does it — or to what to ask first.',
      tools: 'Or go straight to a tool',
      more: 'More services',
      next: 'Next, perhaps: remote multiparty agreements.',
      trust: ['No document upload', 'No account', 'No backend', 'Open source'],
    },
    cs: {
      eyebrow: 'Nezávislé nástroje pro dokumenty',
      lead: 'Co potřebujete',
      mark: 'vyřídit?',
      intro: 'Vyberte svou situaci. Pár otázek vás dovede k nástroji, který to udělá — nebo k tomu, na co se nejdřív zeptat.',
      tools: 'Nebo rovnou k nástroji',
      more: 'Další služby',
      next: 'Příště možná: smlouvy více stran na dálku.',
      trust: ['Bez nahrávání dokumentů', 'Bez účtu', 'Bez serveru', 'Otevřený kód'],
    },
  };
  const t = $derived(pick(TEXT));
  const journeys = $derived(situationsIn(site.lang).journeys);
  /** This page is wholly in the chosen language, so it says so: a translator then leaves it alone. */
  $effect(() => {
    document.documentElement.lang = site.lang;
  });
</script>

<SiteBar bind:menu />

<main>
  <section class="home hub">
    <div class="home-wrap">
      <div class="hero">
        <div class="eyebrow">{t.eyebrow}</div>
        <h1>{t.lead} <mark class="hlm">{t.mark}</mark></h1>
        <p>{t.intro}</p>
      </div>

      <!--
        Situations first, tools second: a first-time visitor should not have to know which of
        the services does what before starting (UX test, 2026-10). Each card opens its journey
        on /situations/.
      -->
      <div class="situation-grid hub-situations">
        {#each journeys as j, i}
          <a class="situation-card" class:lead={i === 0} href={`${SITUATIONS_HREF}#${j.id}`}>
            <strong>{j.title}</strong>
            <span>{j.description}</span>
          </a>
        {/each}
      </div>

      <h2 class="hub-tools-head">{t.tools}</h2>
      <div class="product-grid">
        {#each SERVICES as s}
          <a class="product-card" href={s.href}>
            <div class="top">
              <span class="brand-mark"><span>{s.mark}</span></span>
              <h2 translate="no">{s.name}</h2>
              <span class="kicker" aria-hidden="true">↗</span>
            </div>
            <p>{site.lang === 'cs' ? s.cs.description : s.description}</p>
            <div class="pages">
              {#each s.tabs.slice(0, 4) as tab}
                <span class="chip">{site.lang === 'cs' ? (TABS_CS[tab.label] ?? tab.label) : tab.label}</span>
              {/each}
            </div>
          </a>
        {/each}
        <div class="product-card soon">
          <div class="top">
            <span class="brand-mark"><span>+</span></span>
            <h2>{t.more}</h2>
          </div>
          <p>{t.next}</p>
        </div>
      </div>

      <div class="trust-row">
        {#each t.trust as item}<span>{item}</span>{/each}
      </div>
    </div>
  </section>
</main>

<HubFooter />
