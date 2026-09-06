<script lang="ts">
  import Attest from './views/Attest.svelte';
  import Help from './views/Help.svelte';
  import Home from './views/Home.svelte';
  import Library from './views/Library.svelte';
  import Notarize from './views/Notarize.svelte';
  import Verify from './views/Verify.svelte';
  import { NAV, ROUTES, type View } from './nav';

  function viewFromHash(): View {
    const raw = location.hash.replace(/^#\/?/, '');
    return (ROUTES as readonly string[]).includes(raw) ? (raw as View) : 'home';
  }

  let view = $state<View>(viewFromHash());
  /**
   * The maturity notice is revealed rather than displayed: it opens on hover
   * and on focus. Focus rather than click is what makes it reachable without a
   * mouse — tapping the control focuses it, tapping away blurs it — and it
   * avoids a hover and a click fighting over the same state. A notice nobody
   * on a touch screen could read would not be a notice.
   */
  let stageOpen = $state(false);
  // Bumped when a certificate is stored, so the library reloads on next view.
  let libraryRevision = $state(0);
  let online = $state(navigator.onLine);

  function go(next: View) {
    view = next;
    history.replaceState(null, '', next === 'home' ? '#/' : `#/${next}`);
    scrollTo({ top: 0 });
  }

  $effect(() => {
    const onHash = () => (view = viewFromHash());
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

<header class="topbar">
  <div class="nav">
    <button class="brand" onclick={() => go('home')}>
      <span class="brand-mark"><span>xN</span></span>
      <span>xNotary<span class="brand-domain">.digital</span></span>
    </button>

    <nav class="main-nav">
      {#each NAV as item}
        <button
          class="nav-link"
          aria-current={view === item.id ? 'page' : undefined}
          onclick={() => go(item.id)}
        >
          {item.label}
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
    <div class="stage-wrap">
      <button
        type="button"
        class="stage"
        aria-expanded={stageOpen}
        aria-describedby="stage-note"
        onmouseenter={() => (stageOpen = true)}
        onmouseleave={() => (stageOpen = false)}
        onfocus={() => (stageOpen = true)}
        onblur={() => (stageOpen = false)}
      >
        Public beta
      </button>
      <div id="stage-note" class="stage-note" role="tooltip" hidden={!stageOpen}>
        <strong>Public beta.</strong> This build has not had a security review, and its wording has
        not been reviewed by a lawyer. The timestamps it produces are real and independently
        verifiable — but treat the app itself as unfinished, and don't rely on it for anything that
        matters yet.
      </div>
    </div>
  </div>
</header>

{#if !online}
  <div class="band">
    <div>
      <strong>You are offline.</strong> Checking a document against a certificate still works for the
      hash check, but confirming a Bitcoin anchor and creating new timestamps both need a connection.
    </div>
  </div>
{/if}

<main>
  {#if view === 'home'}
    <Home {go} />
  {:else if view === 'notarize'}
    <Notarize onstored={() => libraryRevision++} {go} />
  {:else if view === 'attest'}
    <Attest {go} />
  {:else if view === 'verify'}
    <Verify />
  {:else if view === 'library'}
    <Library revision={libraryRevision} {go} />
  {:else}
    <Help {go} />
  {/if}
</main>

<footer class="site">
  <div>
    Your files never leave this device — only a SHA-256 digest is sent to public OpenTimestamps
    calendars. xNotary is free and open source under the
    <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">
      AGPL-3.0</a
    >. It is not a law firm and this is not legal advice.
  </div>
</footer>
