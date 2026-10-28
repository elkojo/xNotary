<!--
  A text that is rebuilt, not edited, when it changes — for labels that say what a click will
  do ("Refresh anyway", "Sign, timestamp and save").

  A browser translator (Chrome's, Edge's) replaces the page's text nodes with its own. Svelte
  then updates the text in the node it created, which is no longer on the page, so the old label
  stays on screen, translated, after it has stopped being true. A new element per text is
  translated afresh. Pinned by the simulated-translation check (docs/i18n.md).
-->
<script lang="ts">
  let { text }: { text: string } = $props();
</script>

{#key text}<span>{text}</span>{/key}
