<script lang="ts">
  import Stepper from '../../../../app/src/site/Stepper.svelte';
  import Info from '../../../../app/src/site/Info.svelte';
  import Progress from '../../../../app/src/site/Progress.svelte';
  import { formatBytes } from '../../../../app/src/site/size';
  import { defaultPaper, outputName, type ConvertResult, type Paper } from '../lib/convert';
  import { ConverterError, convertDocument, formats, preload } from '../lib/converter';
  import { COMMON_INPUTS, COMMON_OUTPUTS, detectInput } from '../lib/formats';
  import type { Progress as Download } from '../lib/protocol';
  import { canRunPandoc } from '../lib/support';
  import {
    DOWNLOAD_MB,
    LayoutCancelled,
    canKeepLayout,
    cancelKeepingLayout,
    convertKeepingLayout,
    hasComments,
    keepsLayout,
    type LayoutProgress,
  } from '../lib/libreoffice';

  const supported = canRunPandoc();
  /** "Keep the layout" (LibreOffice) is offered on computers only: see lib/libreoffice.ts. */
  const offerLayout = canKeepLayout();
  const locale = navigator.language || 'en';

  let main = $state<File | null>(null);
  let resources = $state<File[]>([]);
  /** pandoc's name for the input format: detected, or chosen under "all formats". */
  let from = $state<string | null>(null);
  let to = $state('pdf');
  let paper = $state<Paper>(defaultPaper(locale));
  let over = $state(false);
  let layout = $state<'retypeset' | 'keep'>('retypeset');
  /** Whether the document has comments, which "Keep the layout" leaves out. */
  let comments = $state(false);
  let layoutProgress = $state<LayoutProgress | null>(null);
  /** Whether the result on screen came from LibreOffice, for what step 3 says about it. */
  let keptLayout = $state(false);

  let all = $state<{ inputs: string[]; outputs: string[] } | null>(null);
  let showAll = $state(false);
  let progress = $state<Download | null>(null);
  let busy = $state(false);
  /** LibreOffice is running: it can take minutes, so it can be cancelled. */
  let laying = $state(false);
  let result = $state<ConvertResult | null>(null);
  let failure = $state<{ message: string; detail: string } | null>(null);

  const step = $derived(result ? 3 : main && from ? 2 : 1);
  const keeping = $derived(offerLayout && to === 'pdf' && keepsLayout(from) && layout === 'keep');
  const readable = COMMON_INPUTS.map((f) => f.extensions[0].toUpperCase()).join(', ');
  const labelFor = (id: string) => COMMON_OUTPUTS.find((f) => f.id === id)?.label ?? id;
  const inputLabel = (id: string) => COMMON_INPUTS.find((f) => f.id === id)?.label ?? id;

  /** Starts pandoc's download as soon as there is a document: by then the intent is clear. */
  function warmUp() {
    preload(onProgress).then(
      () => (progress = null),
      () => (progress = null), // reported when it matters, by the conversion itself
    );
  }
  const onProgress = (p: Download) => (progress = p.loaded >= p.total && p.total > 0 ? null : p);

  function take(list: FileList | null | undefined) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    // The document is the first file in a format xConvert reads; the rest travel with it.
    const document = files.find((f) => detectInput(f.name)) ?? files[0];
    main = document;
    resources = files.filter((f) => f !== document);
    from = detectInput(document.name)?.id ?? null;
    result = null;
    failure = null;
    comments = false;
    const format = from;
    if (offerLayout && keepsLayout(format)) {
      document.arrayBuffer().then(
        async (b) => (comments = await hasComments(new Uint8Array(b), format)),
        () => (comments = false),
      );
    }
    if (supported) warmUp();
  }

  async function revealAll() {
    showAll = true;
    if (!all && supported) all = await formats().catch(() => null);
  }

  async function run() {
    if (!main || !from) return;
    busy = true;
    failure = null;
    try {
      if (keeping && keepsLayout(from)) {
        laying = true;
        const bytes = await convertKeepingLayout(new Uint8Array(await main.arrayBuffer()), from, (p) => (layoutProgress = p));
        result = { bytes, fileName: outputName(main.name, 'pdf'), mime: 'application/pdf', warnings: [] };
        keptLayout = true;
        return;
      }
      keptLayout = false;
      result = await convertDocument(
        {
          input: { name: main.name, bytes: new Uint8Array(await main.arrayBuffer()), format: from },
          resources: await Promise.all(resources.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))),
          to,
          paper,
          fallbackLang: locale,
          now: new Date(),
        },
        onProgress,
      );
    } catch (e) {
      if (e instanceof LayoutCancelled) return;
      failure =
        e instanceof ConverterError
          ? { message: e.message, detail: e.detail }
          : { message: 'The converter could not run.', detail: String(e) };
    } finally {
      busy = false;
      laying = false;
      progress = null;
      layoutProgress = null;
    }
  }

  function save(r: ConvertResult) {
    const url = URL.createObjectURL(new Blob([r.bytes.slice()], { type: r.mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = r.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function reset() {
    main = null;
    resources = [];
    from = null;
    result = null;
    failure = null;
  }
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
        <Stepper steps={['Choose', 'Convert to', 'Save']} current={step} />

        {#if !supported}
          <div class="flow-panel">
            <div class="notice bad" role="alert">
              <strong>This browser cannot run the converter.</strong> Update it, or use a current
              Chrome, Edge, Firefox or Safari (18.4 or later).<Info
                >pandoc needs WebAssembly exception handling, in every major browser since 2025.
                Nothing was downloaded.</Info
              >
            </div>
          </div>
        {:else if step === 1}
          <div class="flow-panel">
            <!-- The ⓘ sits in the title, not in the drop zone: a click on a <label> goes to its
                 first control, and a button inside it would take the click from the file input. -->
            <h2 class="panel-title">
              Choose a document<Info
                >Images a Markdown or HTML file refers to can be dropped with it, in one go.</Info
              >
            </h2>

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
                take(event.dataTransfer?.files);
              }}
            >
              <div>
                <div class="file-icon" aria-hidden="true">DOC</div>
                <strong>Drop a document here</strong>
                <div class="drop-hint">or click to choose one — {readable}</div>
              </div>
              <input type="file" multiple onchange={(event) => take(event.currentTarget.files)} />
            </label>

            {#if main && !from}
              <div class="notice bad" role="alert">
                <strong>{main.name} is not a format xConvert recognises.</strong>
                {#if main.name.toLowerCase().endsWith('.txt')}Rename it to .md if it is Markdown.<Info
                    >pandoc reads no plain-text format, and reading text as Markdown would turn its
                    <code>*</code> and <code>#</code> into formatting.</Info
                  >{/if}
                {#if !showAll}
                  <button class="link-button" onclick={revealAll}>Read it as…</button>
                {:else if all}
                  <select class="input read-as" onchange={(e) => (from = e.currentTarget.value || null)}>
                    <option value="">Read it as…</option>
                    {#each all.inputs as id}<option value={id}>{id}</option>{/each}
                  </select>
                {:else}
                  <span class="spinner"></span>
                {/if}
              </div>
            {/if}

            <div class="notice">
              <strong>A converted document is re-typeset, not copied.</strong> Check it before you
              sign or timestamp it.<Info
                >Headings, paragraphs, lists, tables, images and footnotes carry over. Page layout,
                headers and footers, text boxes, tracked changes and comments may not. Any signature
                inside the original is not carried over: the converted file is new bytes.{#if offerLayout}
                  For Word and OpenDocument files, Keep the layout lays the document out with
                  LibreOffice instead, as a word processor prints it.{:else} For an exact copy of a
                  Word layout, use Word's own Save as PDF.{/if}</Info
              >
            </div>
          </div>
        {:else if step === 2 && main && from}
          <div class="flow-panel">
            <h2 class="panel-title">Convert to</h2>

            <div class="review-box">
              <div class="review-row">
                <span>Document</span>
                <strong>{main.name} · {inputLabel(from)} · {formatBytes(main.size)}</strong>
              </div>
              {#if resources.length}
                <div class="review-row">
                  <span>With</span>
                  <strong>{resources.map((f) => f.name).join(', ')}</strong>
                </div>
              {/if}
            </div>

            <div class="choice-row formats" role="radiogroup" aria-label="Output format">
              {#each COMMON_OUTPUTS as format}
                <button
                  type="button"
                  class="choice"
                  class:selected={to === format.id}
                  role="radio"
                  aria-checked={to === format.id}
                  onclick={() => (to = format.id)}>{format.label}</button
                >
              {/each}
            </div>

            {#if showAll && all}
              <select class="input all-formats" value={to} onchange={(e) => (to = e.currentTarget.value)}>
                <option value="pdf">PDF/A (archival)</option>
                {#each all.outputs.filter((id) => id !== 'pdf') as id}<option value={id}>{id}</option>{/each}
              </select>
            {:else}
              <button class="link-button" onclick={revealAll}>Show all formats</button>
            {/if}

            {#if offerLayout && to === 'pdf' && keepsLayout(from)}
              <div class="field layout">
                <span class="field-label"
                  >Layout<Info
                    >Re-typeset keeps the structure and sets it afresh. Keep the layout lays the
                    document out with LibreOffice, as a word processor prints it: headers and
                    footers, fonts, tables and page breaks.</Info
                  ></span
                >
                <div class="choice-row" role="radiogroup" aria-label="Layout">
                  <button type="button" class="choice" class:selected={layout === 'retypeset'} role="radio"
                    aria-checked={layout === 'retypeset'} onclick={() => (layout = 'retypeset')}>Re-typeset</button
                  >
                  <button type="button" class="choice" class:selected={layout === 'keep'} role="radio"
                    aria-checked={layout === 'keep'} onclick={() => (layout = 'keep')}>Keep the layout</button
                  >
                </div>
                {#if layout === 'keep'}
                  <p class="field-help">
                    Uses LibreOffice: about {DOWNLOAD_MB} MB, downloaded once, then kept on this device.
                  </p>
                {/if}
              </div>
              {#if keeping && comments}
                <div class="notice warn">
                  <strong>Comments are not included.</strong> The document's comments are left out of the
                  PDF/A.<Info
                    >PDF/A does not allow comments in the form LibreOffice writes them. The text
                    they are attached to is kept.</Info
                  >
                </div>
              {/if}
            {/if}

            {#if to === 'pdf' && !keeping}
              <div class="field paper">
                <span class="field-label">Paper</span>
                <div class="choice-row">
                  <button type="button" class="choice" class:selected={paper === 'a4'} onclick={() => (paper = 'a4')}>A4</button>
                  <button type="button" class="choice" class:selected={paper === 'letter'} onclick={() => (paper = 'letter')}>Letter</button>
                </div>
              </div>
            {/if}

            {#if layoutProgress}
              <Progress label={layoutProgress.label} loaded={layoutProgress.loaded} total={layoutProgress.total} />
            {:else if progress}
              <Progress
                label="Downloading the {progress.stage === 'pandoc' ? 'converter' : 'typesetter'}, once"
                loaded={progress.loaded}
                total={progress.total}
              />
            {/if}

            {#if failure}
              <div class="notice bad" role="alert">
                <strong>{failure.message}</strong>
                <details class="raw"><summary>Details</summary><pre>{failure.detail}</pre></details>
              </div>
            {/if}

            <div class="flow-actions">
              {#if laying}
                <button class="button ghost-dark" onclick={cancelKeepingLayout}>Cancel</button>
              {:else}
                <button class="button ghost-dark" disabled={busy} onclick={reset}>← Choose another</button>
              {/if}
              <button class="button dark" disabled={busy} onclick={run}>
                {#if busy}<span class="spinner"></span>{/if}
                {busy ? 'Converting…' : `Convert to ${labelFor(to)}`}
              </button>
              <span class="visually-hidden" role="status">{busy ? 'Converting…' : ''}</span>
            </div>
          </div>
        {:else if step === 3 && result}
          <div class="flow-panel">
            <div class="success">
              <div class="success-mark" aria-hidden="true">✓</div>
              <h2>Converted</h2>
              <p>{result.fileName} · {formatBytes(result.bytes.byteLength)}</p>
              <div class="success-actions">
                <button class="button dark" onclick={() => result && save(result)}>Save {result.fileName}</button>
              </div>
            </div>

            {#if result.warnings.length}
              <div class="notice warn">
                <strong>pandoc noted {result.warnings.length === 1 ? 'one thing' : `${result.warnings.length} things`}.</strong>
                <ul>
                  {#each result.warnings as warning}<li>{warning}</li>{/each}
                </ul>
              </div>
            {/if}

            <div class="notice">
              {#if keptLayout}
                Check it before you sign or timestamp it — LibreOffice laid it out; it is a new file.
              {:else}
                Check it before you sign or timestamp it — it was re-typeset, not copied.
              {/if}
            </div>

            <div class="flow-actions">
              <button class="button ghost-dark" onclick={() => (result = null)}>← Another format</button>
              <button class="button ghost-dark" onclick={reset}>Convert another document</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .formats {
    margin: 18px 0 10px;
  }
  .all-formats,
  .read-as {
    max-width: 280px;
    margin-top: 8px;
  }
  .paper {
    margin-top: 18px;
  }
</style>
