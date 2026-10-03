<script lang="ts">
  import type { Snippet } from 'svelte';
  import { SERVICES, TASKS, pageHref, service, type ServiceId } from './services';

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
    <a class="brand small" href="/" aria-label="xNotary.digital — all services">
      <span class="brand-mark"><span>x</span></span>
      <span class="brand-text">xNotary<span class="brand-domain">.digital</span></span>
    </a>
    <span class="bar-divider"></span>

    <div class="drop">
      <button class="switcher" aria-expanded={menu === 'services'} onclick={() => toggle('services')}>
        {#if here}
          <span class="brand-mark"><span>{here.mark}</span></span>{here.name}
        {:else}
          Services
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
                <strong>{s.name}{#if s.external}<span class="external" aria-label="(opens its current address)"> ↗</span>{/if}</strong>
                <small>{s.tagline}</small>
              </span>
            </a>
          {/each}
          <div class="menu-foot"><a href="/">All services on xNotary.digital</a></div>
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

    <div class="drop entry-slot">
      <button class="task-btn" aria-expanded={menu === 'tasks'} onclick={() => toggle('tasks')}>
        I want to…<span class="caret" aria-hidden="true">▼</span>
      </button>
      {#if menu === 'tasks'}
        <div class="menu right task-menu">
          <h4>What do you need to do?</h4>
          <div class="task-grid">
            {#each TASKS as task}
              {@const s = service(task.service)}
              <a class="task-item" href={pageHref(task.service, task.page)} onclick={(e) => within(e, task.service, task.page)}>
                <strong>{task.title}</strong>
                <span class="d">{task.description}</span>
                <span class="tag">
                  <span class="brand-mark"><span>{s.mark}</span></span>{s.name}{#if s.external} ↗{/if}
                </span>
              </a>
            {/each}
          </div>
          <div class="menu-foot"><a href="/">Browse services instead</a></div>
        </div>
      {/if}
    </div>

    {@render children?.()}
  </div>
</header>
