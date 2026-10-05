<script lang="ts">
  import Info from '../../../../app/src/site/Info.svelte';
  import { COMMON_INPUTS, detectInput, type Format } from '../lib/formats';

  let file = $state<File | null>(null);
  let format = $state<Format | null>(null);
  let over = $state(false);

  function take(picked: File | undefined) {
    if (!picked) return;
    file = picked;
    format = detectInput(picked.name);
  }

  const readable = COMMON_INPUTS.map((f) => f.extensions[0].toUpperCase()).join(', ');
  const size = (n: number) =>
    n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
</script>

<section class="product-view">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>Convert a document</h1>
      </div>
      <span class="secure-note"
        >Processed in this browser<Info
          >The document is read and converted on this device and never sent anywhere. The
          converters are downloaded from this site once, then kept for offline use.</Info
        ></span
      >
    </div>

    <div class="flow-shell">
      <div class="flow-main">
        <div class="stepper">
          <button class="step active" disabled>1 Choose</button>
          <button class="step" disabled>2 Convert to</button>
          <button class="step" disabled>3 Save</button>
        </div>

        <div class="flow-panel">
          <h2 class="panel-title">Choose a document</h2>

          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <label
            class="dropzone"
            class:over
            ondragover={(event) => {
              event.preventDefault();
              over = true;
            }}
            ondragleave={() => (over = false)}
            ondrop={(event) => {
              event.preventDefault();
              over = false;
              take(event.dataTransfer?.files?.[0]);
            }}
          >
            <div>
              <span class="file-icon" aria-hidden="true">{file ? '✓' : '⇄'}</span>
              <strong>{file ? file.name : 'Drop a document here'}</strong>
              <p>{file ? `${size(file.size)} · click to choose another` : readable}</p>
              {#if !file}<span class="button dark small">Choose a file</span>{/if}
            </div>
            <input
              type="file"
              accept={COMMON_INPUTS.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',')}
              onchange={(event) => take(event.currentTarget.files?.[0])}
            />
          </label>

          {#if file && format}
            <div class="notice ok">Read as <strong>{format.label}</strong>.</div>
          {:else if file}
            <div class="notice bad">
              <strong>Not a format xConvert reads.</strong> Choose {readable}.{#if file.name
                .toLowerCase()
                .endsWith('.txt')}<Info
                  >Plain text has no structure to convert from: pandoc reads no plain-text format,
                  and reading it as Markdown would turn its <code>*</code> and <code>#</code> into
                  formatting. Rename it to .md if it is Markdown.</Info
                >{/if}
            </div>
          {/if}

          <!--
            Visible from the start, not after the conversion: the reader decides
            whether to use this before they have a result to compare.
          -->
          <div class="notice">
            <strong>A converted document is re-typeset, not copied.</strong> Check it before you sign
            or timestamp it.<Info
              >Headings, paragraphs, lists, tables, images and footnotes carry over. Page layout,
              headers and footers, text boxes, tracked changes and comments may not. Any signature
              inside the original is not carried over: the converted file is new bytes. For an
              exact copy of a Word layout, use Word's own Save as PDF.</Info
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
