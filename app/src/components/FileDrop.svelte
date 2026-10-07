<script lang="ts">
  import { formatBytes } from '../site/size';

  interface Props {
    /** "Drop … here": the family's wording, shared with xSignature and xConvert. */
    label: string;
    /** What to choose, after "or click to choose one — ". */
    hint?: string;
    accept?: string;
    /**
     * What has been chosen. Once there is something, the zone gives way to the
     * family's summary card and a button to choose again — as xSignature does.
     */
    files?: readonly File[];
    /** Accept several files at once — parallel signing produces one per signer. */
    multiple?: boolean;
    /** The two-up variant used where a screen needs more than one drop target. */
    compact?: boolean;
    /** The format in the file mark — PDF, FILE. Kept short: it is set in a 48px box. */
    icon?: string;
    onselect: (file: File) => void;
    /** Called instead of `onselect` when `multiple` is set. */
    onselectmany?: (files: File[]) => void;
  }

  let {
    label,
    hint = '',
    accept = '',
    files = [],
    multiple = false,
    compact = false,
    icon = 'FILE',
    onselect,
    onselectmany,
  }: Props = $props();

  let over = $state(false);
  let input: HTMLInputElement;

  const totalSize = $derived(files.reduce((sum, f) => sum + f.size, 0));

  function take(list: FileList | null | undefined) {
    const picked = [...(list ?? [])];
    if (picked.length === 0) return;
    if (multiple && onselectmany) onselectmany(picked);
    else onselect(picked[0]!);
  }
</script>

<!-- One element, so a grid of drops (Verify) lays out one cell per drop. -->
<div>
  <!-- Outside the zone, so the button below can reach it once the zone is gone. -->
  <input
    bind:this={input}
    type="file"
    hidden
    {accept}
    {multiple}
    onchange={(e) => {
      take(e.currentTarget.files);
      // Choosing the same file again should still count as a choice.
      e.currentTarget.value = '';
    }}
  />

  {#if files.length > 0}
    <div class="picked">
      <div class="picked-name">{files.map((f) => f.name).join(', ')}</div>
      <div class="picked-facts">
        {#if files.length > 1}{files.length} files · {/if}{formatBytes(totalSize)}
      </div>
    </div>
    <div class="action-group">
      <button class="button secondary small" type="button" onclick={() => input.click()}>
        {files.length > 1 ? 'Choose different files' : 'Choose a different file'}
      </button>
    </div>
  {:else}
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
      <div>
        <div class="file-icon" class:long={icon.length > 3} aria-hidden="true">{icon}</div>
        <strong>{label}</strong>
        <!-- The whole zone is the control, so the hint says so rather than drawing a button. -->
        <div class="drop-hint">
          or click to choose {multiple ? 'them' : 'one'}{hint ? ` — ${hint}` : ''}
        </div>
      </div>
    </div>
  {/if}
</div>
