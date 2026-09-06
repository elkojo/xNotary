<script lang="ts">
  import { formatBytes } from '../lib/download';

  interface Props {
    label: string;
    hint?: string;
    accept?: string;
    file?: File | null;
    /** Accept several files at once — parallel signing produces one per signer. */
    multiple?: boolean;
    /** The two-up variant used where a screen needs more than one drop target. */
    compact?: boolean;
    /** Glyph in the file mark. Kept short: it is set at 20px in a 48px box. */
    icon?: string;
    onselect: (file: File) => void;
    /** Called instead of `onselect` when `multiple` is set. */
    onselectmany?: (files: File[]) => void;
  }

  let {
    label,
    hint = '',
    accept = '',
    file = null,
    multiple = false,
    compact = false,
    icon = '+',
    onselect,
    onselectmany,
  }: Props = $props();

  let over = $state(false);
  let input: HTMLInputElement;

  function take(list: FileList | null | undefined) {
    const picked = [...(list ?? [])];
    if (picked.length === 0) return;
    if (multiple && onselectmany) onselectmany(picked);
    else onselect(picked[0]!);
  }
</script>

<div
  class="dropzone"
  class:over
  class:compact
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
  <input
    bind:this={input}
    type="file"
    {accept}
    {multiple}
    onchange={(e) => take(e.currentTarget.files)}
  />

  <div>
    <span class="file-icon" aria-hidden="true">{file ? '✓' : icon}</span>
    {#if file}
      <strong>{file.name}</strong>
      <p>{formatBytes(file.size)} · click to choose a different file</p>
    {:else}
      <strong>{label}</strong>
      {#if hint}<p>{hint}</p>{/if}
      <!-- Looks like a button, is not one: the whole zone is already the control. -->
      {#if !compact}
        <span class="button dark small">Choose a file</span>
      {/if}
    {/if}
  </div>
</div>
