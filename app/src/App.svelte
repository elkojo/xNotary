<script lang="ts">
  import Help from './views/Help.svelte';
  import Library from './views/Library.svelte';
  import Notarize from './views/Notarize.svelte';
  import Verify from './views/Verify.svelte';

  type Tab = 'notarize' | 'verify' | 'library' | 'help';

  const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
    { id: 'notarize', label: 'Notarize' },
    { id: 'verify', label: 'Verify integrity' },
    { id: 'library', label: 'My certificates' },
    { id: 'help', label: 'How it works' },
  ];

  function tabFromHash(): Tab {
    const raw = location.hash.replace(/^#\/?/, '');
    return TABS.some((t) => t.id === raw) ? (raw as Tab) : 'notarize';
  }

  let tab = $state<Tab>(tabFromHash());
  // Bumped when a certificate is stored, so the library reloads on next view.
  let libraryRevision = $state(0);
  let online = $state(navigator.onLine);

  function go(next: Tab) {
    tab = next;
    history.replaceState(null, '', `#/${next}`);
  }

  $effect(() => {
    const onHash = () => (tab = tabFromHash());
    const setOnline = () => (online = navigator.onLine);
    addEventListener('hashchange', onHash);
    addEventListener('online', setOnline);
    addEventListener('offline', setOnline);
    return () => {
      removeEventListener('hashchange', onHash);
      removeEventListener('online', setOnline);
      removeEventListener('offline', setOnline);
    };
  });
</script>

<div class="app">
  <header>
    <div class="masthead">
      <h1>xNotary</h1>
      <span class="tagline">Self-custodial notarization. No accounts, no backend, no uploads.</span>
    </div>
  </header>

  <nav class="tabs">
    {#each TABS as t}
      <button aria-current={tab === t.id ? 'page' : undefined} onclick={() => go(t.id)}>
        {t.label}
      </button>
    {/each}
  </nav>

  {#if !online}
    <div class="notice warn">
      You are offline. Verifying a document against a certificate still works for the hash check,
      but confirming a Bitcoin anchor and creating new timestamps both need a connection.
    </div>
  {/if}

  <main>
    {#if tab === 'notarize'}
      <Notarize onstored={() => libraryRevision++} />
    {:else if tab === 'verify'}
      <Verify />
    {:else if tab === 'library'}
      <Library revision={libraryRevision} />
    {:else}
      <Help />
    {/if}
  </main>

  <footer class="site">
    Your files never leave this device — only a SHA-256 digest is sent to public OpenTimestamps
    calendars. xNotary is free and open source under the
    <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">
      AGPL-3.0</a
    >. It is not a law firm and this is not legal advice.
  </footer>
</div>
