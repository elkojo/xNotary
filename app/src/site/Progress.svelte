<!--
  Progress, as every service on the site shows it: what is happening, a large percentage, a
  bar, and how much of how much. Large because a download over a slow line can take minutes,
  and a small line of grey text under a form does not read as "still going".

  The percentage is shown only where it is measured — bytes downloaded, bytes hashed. A stage
  that has no measure (LibreOffice laying out a document) gets its name and a moving bar, not
  a number that would sit still and look like a hang.
-->
<script lang="ts">
  import { formatBytes } from './size';

  interface Props {
    label: string;
    loaded?: number | null;
    total?: number | null;
  }

  let { label, loaded = null, total = null }: Props = $props();

  const measured = $derived(loaded !== null && total !== null && total > 0);
  const percent = $derived(measured ? Math.min(100, Math.floor((loaded! / total!) * 100)) : null);
</script>

<div class="progress-block">
  <div class="progress-head">
    <span class="progress-label">{label}…</span>
    {#if percent !== null}<span class="progress-percent">{percent}%</span>{/if}
  </div>
  <div
    class="progress"
    class:indeterminate={percent === null}
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={percent ?? undefined}
  >
    <div style:transform={percent === null ? null : `scaleX(${percent / 100})`}></div>
  </div>
  {#if measured}
    <div class="progress-detail">{formatBytes(loaded!)} of {formatBytes(total!)}</div>
  {/if}
</div>
