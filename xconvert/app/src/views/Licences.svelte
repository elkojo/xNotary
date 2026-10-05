<script lang="ts">
  /**
   * What xConvert is made of, under which licences, and where its source is.
   *
   * The AGPL asks a network service to offer its users the source of what they are
   * running — so "this build" links the exact commit, not just the project. pandoc's
   * GPL asks the same of the binary we pass on, which is its unmodified official release.
   */
  const base = import.meta.env.BASE_URL;
  const SOURCE = 'https://github.com/elkojo/xNotary';
  const revision = __APP_REVISION__;
  const commit = __APP_COMMIT__;
  const thisBuild = commit && !revision.endsWith('-dirty') ? `${SOURCE}/tree/${commit}` : null;
</script>

<section class="product-view">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>Licences and source</h1>
      </div>
      <a class="button ghost-dark" href="#/convert">← Convert</a>
    </div>

    <div class="single-card">
      <div class="review-box">
        <div class="review-row">
          <span>xConvert</span>
          <div>
            Free software, <strong>AGPL-3.0-or-later</strong>.
            {#if thisBuild}
              <a href={thisBuild} target="_blank" rel="noopener noreferrer">Source of this build</a>
              (<span class="mono">{revision}</span>).
            {:else}
              <a href={SOURCE} target="_blank" rel="noopener noreferrer">Source</a> — this build
              (<span class="mono">{revision}</span>) is from changes in no published commit.
            {/if}
          </div>
        </div>
        <div class="review-row">
          <span>pandoc 3.12</span>
          <div>
            GPL-2.0-or-later, by John MacFarlane and contributors. Shipped as its official
            WebAssembly release, unmodified:
            <a href="https://github.com/jgm/pandoc/tree/3.12" target="_blank" rel="noopener noreferrer">source</a>,
            <a href="{base}vendor/licences/pandoc-COPYING.md">licence</a>,
            <a href="{base}vendor/licences/pandoc-COPYRIGHT.txt">copyright</a>. Its JavaScript
            loader is adapted from pandoc-wasm
            (<a href="{base}licences/pandoc-wasm-loader-MIT.txt">MIT</a>).
          </div>
        </div>
        <div class="review-row">
          <span>Typst 0.15.1</span>
          <div>
            Apache-2.0, by the Typst project. Built into our own PDF/A wrapper, whose source is in
            the repository; the crates compiled into it, each with its licence:
            <a href="{base}vendor/licences/typst-pdf-THIRD-PARTY.txt">list</a>.
          </div>
        </div>
        <div class="review-row">
          <span>Fonts</span>
          <div>
            Libertinus Serif, DejaVu Sans Mono and New Computer Modern Math, embedded in the PDFs
            xConvert writes:
            <a href="{base}vendor/licences/fonts-NOTICE.txt">licences</a>.
          </div>
        </div>
        <div class="review-row">
          <span>Everything else</span>
          <div>
            The JavaScript your browser downloaded, generated at build time from what is actually in
            it: <a href="{base}THIRD-PARTY.txt">THIRD-PARTY.txt</a>.
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
