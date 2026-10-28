<script lang="ts">
  import type { Snippet } from 'svelte';
  import { SERVICES, SITUATIONS_HREF, TASKS, pageHref, service, type ServiceId } from './services';
  import { LANGUAGES, offeredLangs, pick, setLang, site } from './lang.svelte';
  import { SUPPORT_HREF } from './support';
  import UpdateNotice from './UpdateNotice.svelte';

  /**
   * The one top bar of xNotary.digital: brand (→ the front page), the service
   * switcher, the current service's own tabs, and the "I want to…" task menu.
   * Each service renders it with its own `current` id and tabs; the front page
   * renders it with `current` null and no tabs.
   *
   * Moving within the current service is a hash change handled by `onnav`, so
   * the app keeps its own routing. Anything else is a real link to another
   * document — another service, or the front page.
   */
  let {
    current = null,
    active = null,
    onnav,
    menu = $bindable(null),
    children,
  }: {
    current?: ServiceId | null;
    active?: string | null;
    onnav?: (page: string) => void;
    menu?: 'services' | 'tasks' | null;
    children?: Snippet;
  } = $props();

  const here = $derived(current ? service(current) : null);

  /** The bar's own words. A service's tabs are its own and stay as the service has them. */
  const TEXT = {
    en: {
      services: 'Services',
      allServices: 'All services on xNotary.digital',
      want: 'I want to…',
      what: 'What do you need to do?',
      start: 'Start from your situation',
      startLine: 'A few questions, then the right tool — or what to ask first.',
      support: 'Support',
      supportLine: 'Support the work with a payment.',
      browse: 'Browse services instead',
      screenNote: '',
    },
    cs: {
      services: 'Služby',
      allServices: 'Všechny služby na xNotary.digital',
      want: 'Chci…',
      what: 'Co potřebujete vyřídit?',
      start: 'Začít od své situace',
      startLine: 'Pár otázek a pak správný nástroj — nebo na co se nejdřív zeptat.',
      support: 'Podpora',
      supportLine: 'Podpořte práci platbou.',
      browse: 'Raději procházet služby',
      screenNote:
        'Tato obrazovka je anglicky. Prohlížeč ji umí přeložit; přitom může poslat text stránky svému výrobci. Vaše dokumenty se neodesílají.',
    },
  };
  const t = $derived(pick(TEXT));
  /** Text this layer translated: in its language, and left alone by a browser translator. */
  const ours = $derived(site.lang === 'en' ? {} : { lang: site.lang, translate: 'no' as const });
  const langs = $derived((void site.lang, offeredLangs()));

  function toggle(which: 'services' | 'tasks') {
    menu = menu === which ? null : which;
  }

  /** A click on a page of the service we are already in stays in the app. */
  function within(event: MouseEvent, id: ServiceId, page: string) {
    if (id !== current || !onnav) return;
    event.preventDefault();
    menu = null;
    onnav(page);
  }

  $effect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !(event.target as Element).closest('.drop')) {
        menu = null;
      }
    };
    addEventListener('click', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('click', close);
      removeEventListener('keydown', close);
    };
  });
</script>

<header class="topbar">
  <div class="nav">
    <a class="brand small" href="/" aria-label="xNotary.digital — all services" translate="no">
      <span class="brand-mark"><span>x</span></span>
      <span class="brand-text">xNotary<span class="brand-domain">.digital</span></span>
    </a>
    <span class="bar-divider"></span>

    <div class="drop" {...ours}>
      <button class="switcher" aria-expanded={menu === 'services'} onclick={() => toggle('services')}>
        {#if here}
          <span class="brand-mark"><span>{here.mark}</span></span><span translate="no">{here.name}</span>
        {:else}
          {t.services}
        {/if}
        <span class="caret" aria-hidden="true">▼</span>
      </button>
      {#if menu === 'services'}
        <div class="menu">
          {#each SERVICES as s}
            <a
              class="menu-item"
              href={s.href}
              aria-current={s.id === current ? 'page' : undefined}
              onclick={(e) => within(e, s.id, s.home)}
            >
              <span class="brand-mark"><span>{s.mark}</span></span>
              <span>
                <strong translate="no">{s.name}{#if s.external}<span class="external" aria-label="(opens its current address)"> ↗</span>{/if}</strong>
                <small>{site.lang === 'cs' ? s.cs.tagline : s.tagline}</small>
              </span>
            </a>
          {/each}
          <div class="menu-foot"><a href="/">{t.allServices}</a></div>
        </div>
      {/if}
    </div>

    <nav class="main-nav">
      {#if here}
        {#each here.tabs as tab}
          <a
            class="nav-link"
            href={`#/${tab.id}`}
            aria-current={active === tab.id ? 'page' : undefined}
            onclick={(e) => within(e, here.id, tab.id)}
          >
            {tab.label}
          </a>
        {/each}
      {/if}
    </nav>

    <div class="drop entry-slot" {...ours}>
      <button class="task-btn" aria-expanded={menu === 'tasks'} onclick={() => toggle('tasks')}>
        {t.want}<span class="caret" aria-hidden="true">▼</span>
      </button>
      {#if menu === 'tasks'}
        <div class="menu right task-menu">
          <h4>{t.what}</h4>
          <div class="task-grid">
            <!-- First, and set apart: for when the task itself is not yet clear. -->
            <a class="task-item lead" href={SITUATIONS_HREF}>
              <strong>{t.start}</strong>
              <span class="d">{t.startLine}</span>
              <span class="tag"><span class="brand-mark"><span>x</span></span><span translate="no">xNotary.digital</span></span>
            </a>
            {#each TASKS as task}
              {@const s = service(task.service)}
              <a class="task-item" href={pageHref(task.service, task.page)} onclick={(e) => within(e, task.service, task.page)}>
                <strong>{site.lang === 'cs' ? task.cs.title : task.title}</strong>
                <span class="d">{site.lang === 'cs' ? task.cs.description : task.description}</span>
                <span class="tag">
                  <span class="brand-mark"><span>{s.mark}</span></span><span translate="no">{s.name}</span>{#if s.external} ↗{/if}
                </span>
              </a>
            {/each}
            <!-- The site's own page, not a service's: marked with the site's x. -->
            <a class="task-item" href={SUPPORT_HREF}>
              <strong>{t.support}</strong>
              <span class="d">{t.supportLine}</span>
              <span class="tag"><span class="brand-mark"><span>x</span></span><span translate="no">xNotary.digital</span></span>
            </a>
          </div>
          <div class="menu-foot"><a href="/">{t.browse}</a></div>
        </div>
      {/if}
    </div>

    {#if langs.length > 1}
      <!-- Offered only once there is a choice: see LANGUAGES in lang.svelte.ts. -->
      <div class="lang-switch" role="group" aria-label="Language" translate="no">
        {#each langs as l}
          <button type="button" lang={l} aria-pressed={site.lang === l} class:on={site.lang === l} onclick={() => setLang(l)}
            >{LANGUAGES[l].short}</button
          >
        {/each}
      </div>
    {/if}

    {@render children?.()}
  </div>
  {#if here && t.screenNote}
    <!-- A service screen in another language than its own: say so, and what a browser translator does. -->
    <div class="lang-note" {...ours}>{t.screenNote}</div>
  {/if}
  <UpdateNotice />
</header>
