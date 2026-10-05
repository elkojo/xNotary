<script lang="ts">
  import Attest from './views/Attest.svelte';
  import Help from './views/Help.svelte';
  import Home from './views/Home.svelte';
  import Library from './views/Library.svelte';
  import Notarize from './views/Notarize.svelte';
import Verify from './views/Verify.svelte';
  import { ALIASES, ROUTES, type View } from './nav';
  import SiteBar from './site/SiteBar.svelte';

  /** `#/help/pending` is the Help page, opened at one question. */
  function routeFromHash(): { view: View; topic: string } {
    const [first = '', topic = ''] = location.hash.replace(/^#\/?/, '').split('/');
    const id = ALIASES[first] ?? first;
    return (ROUTES as readonly string[]).includes(id)
      ? { view: id as View, topic }
      : { view: 'home', topic: '' };
  }

  let view = $state<View>(routeFromHash().view);
  let topic = $state(routeFromHash().topic);
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
    topic = '';
    history.replaceState(null, '', next === 'home' ? '#/' : `#/${next}`);
    scrollTo({ top: 0 });
  }

  $effect(() => {
    const onHash = () => ({ view, topic } = routeFromHash());
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

<SiteBar current="xnotary" active={view} onnav={(page) => go(page as View)}>
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
</SiteBar>

{#if !online}
  <div class="band">
    <div>
      <strong>You are offline.</strong> Matching a document to its certificate still works; timestamping
      and checking Bitcoin do not.
    </div>
  </div>
{/if}

<main>
  {#if view === 'home'}
    <Home {go} />
  {:else if view === 'notarize'}
    <Notarize onstored={() => libraryRevision++} {go} />
  {:else if view === 'attest'}
<Attest />
  {:else if view === 'verify'}
    <Verify />
  {:else if view === 'library'}
    <Library revision={libraryRevision} {go} />
  {:else}
    <Help {go} {topic} />
  {/if}
</main>

<footer class="site">
  <div>
    Your files never leave this device. Free and open source under the
    <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">
      AGPL-3.0</a
    >. Not legal advice.
  </div>
</footer>
