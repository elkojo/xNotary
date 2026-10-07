<!--
  One line under a finished task, on xNotary and xSignature (not xConvert), pointing to /support/.
  A new tab, because the page it sits on may still hold the only copy of a result (Certificate 2
  lives in its tab until saved).
-->
<script lang="ts">
  import { SUPPORT_HREF } from './support';
</script>

<p class="support-link">
  <span class="support-link-mark" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false"
      ><path d="M12 20s-7.5-4.6-7.5-10A4.25 4.25 0 0 1 12 7.4 4.25 4.25 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" /></svg
    >
  </span>
  <span>
    If xNotary.digital saved you time, you can
    <a href={SUPPORT_HREF} target="_blank" rel="noopener">support the project</a>.
  </span>
</p>
