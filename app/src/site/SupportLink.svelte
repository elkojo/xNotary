<!--
  One line under a finished task, on every service, pointing to /support/ — and, the first time
  in a browser session, the same thank-you and payment in a dialog over the page.

  The link opens a new tab, and the dialog sits over the page rather than replacing it, because
  the page may still hold the only copy of a result (Certificate 2 lives in its tab until
  saved). The dialog waits a moment so the browser's own download UI is seen first, and is
  offered at most once per session (`claimSupportOffer`): voluntary, always. It is moved to
  <body> so the host screen's styles (`.flow-panel h2` and the like) cannot reach into it.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import SupportCard from './SupportCard.svelte';
  import { site } from './lang.svelte';
  import { OFFER_DELAY_MS, SUPPORT_HREF, claimSupportOffer } from './support';

  let dialog = $state<HTMLDialogElement>();
  let offered = $state(false);

  onMount(() => {
    if (!claimSupportOffer()) return;
    offered = true;
    const timer = setTimeout(() => {
      if (dialog?.isConnected && !dialog.open) dialog.showModal();
    }, OFFER_DELAY_MS);
    return () => clearTimeout(timer);
  });

  function toBody(node: HTMLElement) {
    document.body.append(node);
    return { destroy: () => node.remove() };
  }

  /** A click on the backdrop lands on the dialog itself, outside its content box. */
  function onBackdrop(e: MouseEvent) {
    if (e.target === dialog) dialog.close();
  }
</script>

<p class="support-link">
  <span class="support-link-mark" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false"
      ><path d="M12 20s-7.5-4.6-7.5-10A4.25 4.25 0 0 1 12 7.4 4.25 4.25 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" /></svg
    >
  </span>
  <span>
    <strong>Success!</strong> If xNotary.digital saved you time, you can
    <a href={SUPPORT_HREF} target="_blank" rel="noopener">support the project</a>.
  </span>
</p>

{#if offered}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <dialog
    bind:this={dialog}
    use:toBody
    class="support-dialog"
    aria-labelledby="support-dialog-title"
    onclick={onBackdrop}
  >
    <!-- First in the dialog, so it takes the focus: Enter or Space closes, never pays. -->
    <button type="button" class="support-dialog-close" aria-label={site.lang === 'cs' ? 'Zavřít' : 'Close'} onclick={() => dialog?.close()}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
    <!-- Fills the dialog, so a click that lands on the dialog itself came from the backdrop. -->
    <div class="support-dialog-body">
      <SupportCard heading="h2" titleId="support-dialog-title" />
    </div>
  </dialog>
{/if}
