<script lang="ts">
  /** The shell: the xNotary.digital bar, the screen, the footer. */
  import SiteBar from '../../../app/src/site/SiteBar.svelte';
  import Convert from './views/Convert.svelte';
  import { NAV, ROUTES, type View } from './nav';

  function viewFromHash(): View {
    const raw = location.hash.replace(/^#\/?/, '');
    return (ROUTES as readonly string[]).includes(raw) ? (raw as View) : 'convert';
  }

  let view = $state<View>(viewFromHash());

  function go(next: View) {
    view = next;
    history.replaceState(null, '', `#/${next}`);
    scrollTo({ top: 0 });
  }

  $effect(() => {
    document.title = (NAV.find((item) => item.id === view) ?? NAV[0]).title;
  });

  $effect(() => {
    const onHash = () => (view = viewFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  });
</script>

<SiteBar current="xconvert" active={view} onnav={(page) => go(page as View)} />

<main>
  <Convert />
</main>

<footer class="site">
  <div>
    Your documents never leave this device. Free and open source under the
    <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">
      AGPL-3.0</a
    >, built on <a href="https://pandoc.org" target="_blank" rel="noopener noreferrer">pandoc</a> and
    <a href="https://typst.app" target="_blank" rel="noopener noreferrer">Typst</a>.
    <div class="site-version">Version {__APP_VERSION__}</div>
  </div>
</footer>
