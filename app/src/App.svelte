<script lang="ts">
  import Attest from './views/Attest.svelte';
  import Help from './views/Help.svelte';
  import Library from './views/Library.svelte';
  import Notarize from './views/Notarize.svelte';
  import Verify from './views/Verify.svelte';

  type Tab = 'notarize' | 'attest' | 'verify' | 'library' | 'help';

  const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
    { id: 'notarize', label: 'Notarize' },
    { id: 'attest', label: 'Attest signatures' },
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

  <!--
    Maturity of the software, which is a different claim from what the
    certificates say about themselves. Each certificate already states its own
    limits precisely; nothing there tells a visitor that the app producing them
    has not been reviewed. Deliberately not printed on the certificates: those
    are meant to outlive this period and to verify without xNotary existing.
    Remove at M3, once both reviews are done — see docs/next-session.md.
  -->
  <div class="notice warn prerelease">
    <strong>Pre-release.</strong> This build has not had a security review, and its wording has not
    been reviewed by a lawyer. The timestamps it produces are real and independently verifiable —
    but treat the app itself as unfinished, and don't rely on it for anything that matters yet.
  </div>

  {#if !online}
    <div class="notice warn">
      You are offline. Verifying a document against a certificate still works for the hash check,
      but confirming a Bitcoin anchor and creating new timestamps both need a connection.
    </div>
  {/if}

  <main>
    {#if tab === 'notarize'}
      <Notarize onstored={() => libraryRevision++} />
    {:else if tab === 'attest'}
      <Attest />
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

<style>
  /* The pre-release notice sits above the offline notice and must not be
     mistaken for a transient status message, so it is a touch quieter than a
     warning but always present. */
  .prerelease {
    margin-top: 0.75rem;
  }
</style>
