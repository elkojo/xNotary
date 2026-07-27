<script lang="ts">
  import { formatBytes } from '../lib/download';

  interface Props {
    label: string;
    hint?: string;
    accept?: string;
    file?: File | null;
    onselect: (file: File) => void;
  }

  let { label, hint = '', accept = '', file = null, onselect }: Props = $props();

  let over = $state(false);
  let input: HTMLInputElement;

  function take(list: FileList | null | undefined) {
    const picked = list?.[0];
    if (picked) onselect(picked);
  }
</script>

<div
  class="dropzone"
  class:over
  role="button"
  tabindex="0"
  ondragover={(e) => {
    e.preventDefault();
    over = true;
  }}
  ondragleave={() => (over = false)}
  ondrop={(e) => {
    e.preventDefault();
    over = false;
    take(e.dataTransfer?.files);
  }}
  onclick={() => input.click()}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  }}
>
  <input bind:this={input} type="file" {accept} onchange={(e) => take(e.currentTarget.files)} />

  {#if file}
    <strong>{file.name}</strong>
    <div class="meta">{formatBytes(file.size)} · click to choose a different file</div>
  {:else}
    <strong>{label}</strong>
    {#if hint}<div class="meta">{hint}</div>{/if}
  {/if}
</div>

<style>
  .meta {
    color: var(--muted);
    font-size: 0.85rem;
    margin-top: 0.35rem;
  }
</style>
