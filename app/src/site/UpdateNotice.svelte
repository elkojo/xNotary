<!--
  "A newer version is out", under the bar on every page of the site. It offers a refresh and
  never makes one: whatever this page holds — a document, a key, a drawn signature — exists
  only here. When a view says a refresh would lose its work (holdRefresh), the notice says so
  before the button does it. See update-check.ts.
-->
<script lang="ts">
  import {
    dismissBuild,
    onHoldsChange,
    refreshWouldLoseWork,
    watchForUpdates,
  } from './update-check';

  let served = $state<string | null>(null);
  let wouldLose = $state(refreshWouldLoseWork());

  $effect(() => onHoldsChange(() => (wouldLose = refreshWouldLoseWork())));

  $effect(() => {
    // Dev servers have no /version.json; only a deployed build has anything to compare.
    if (!import.meta.env.PROD) return;
    return watchForUpdates(__BUILD_ID__, (build) => (served = build));
  });

  function later() {
    if (served) dismissBuild(served);
    served = null;
  }

  function refresh() {
    // Set aside first: if an edge still hands back the old page, the notice does not return.
    if (served) dismissBuild(served);
    location.reload();
  }
</script>

{#if served}
  <div class="update-strip" role="status">
    <span>
      <strong>A newer version of the site is out.</strong>
      {#if wouldLose}
        Refreshing clears what you have open here — finish and save it first.
      {/if}
    </span>
    <span class="update-actions">
      <button class="button dark small" type="button" onclick={refresh}
        >{wouldLose ? 'Refresh anyway' : 'Refresh'}</button
      >
      <button class="button ghost-dark small" type="button" onclick={later}>Later</button>
    </span>
  </div>
{/if}
