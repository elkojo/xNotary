<script lang="ts">
  /**
   * "Verify" — the screen a signer uses after receiving a document and a
   * Certificate 1 out of band. It answers two separate questions:
   *   1. Is this document the one the certificate is about? (hash match)
   *   2. Is the certificate's timestamp real? (OTS proof against Bitcoin)
   * Both must hold. Either failing is reported plainly rather than glossed.
   */
  import FileDrop from '../components/FileDrop.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import { extractOtsAttachment } from '../lib/certificate1';
  import { formatBytes } from '../lib/download';
  import { bytesEqual, groupHex, sha256File, toHex } from '../lib/hash';
  import { checkStatus, describeProof, digestOf, parseOts, type OtsStatus } from '../lib/ots';
  import { utcStamp } from '../lib/time';

  let documentFile = $state<File | null>(null);
  let proofFile = $state<File | null>(null);
  let checking = $state(false);
  let error = $state('');

  let outcome = $state<{
    hashMatches: boolean;
    documentDigest: string;
    proofDigest: string;
    status: OtsStatus;
    proofText: string;
    proofSource: string;
  } | null>(null);

  function reset() {
    outcome = null;
    error = '';
  }

  /** Accept either a raw `.ots` or a Certificate 1 PDF with the proof attached. */
  async function readProof(f: File): Promise<{ ots: Uint8Array; source: string }> {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (f.name.toLowerCase().endsWith('.pdf') || bytes[0] === 0x25) {
      const embedded = await extractOtsAttachment(bytes);
      if (!embedded) {
        throw new Error(
          'That PDF has no OpenTimestamps proof attached. Use the .ots file instead, or a ' +
            'Certificate 1 produced by xNotary.',
        );
      }
      return { ots: embedded, source: 'proof embedded in the certificate PDF' };
    }
    return { ots: bytes, source: 'the .ots file' };
  }

  async function check() {
    if (!documentFile || !proofFile) return;
    checking = true;
    reset();
    try {
      const { ots, source } = await readProof(proofFile);
      const timestamp = parseOts(ots);

      const documentDigest = await sha256File(documentFile);
      const proofDigest = digestOf(timestamp);
      const hashMatches = bytesEqual(documentDigest, proofDigest);

      const status = await checkStatus(timestamp);

      outcome = {
        hashMatches,
        documentDigest: toHex(documentDigest),
        proofDigest: toHex(proofDigest),
        status,
        proofText: describeProof(timestamp),
        proofSource: source,
      };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      checking = false;
    }
  }

  const verdict = $derived.by(() => {
    if (!outcome) return null;
    if (!outcome.hashMatches) return 'mismatch';
    if (outcome.status.kind === 'confirmed') return 'proven';
    if (outcome.status.kind === 'pending') return 'pending';
    return 'unchecked';
  });

  const step = $derived(outcome ? 2 : 1);
  const tone = $derived(
    verdict === 'mismatch' ? 'bad' : verdict === 'proven' ? 'good' : 'waiting',
  );
</script>

<section class="product-view">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>Verify a document</h1>
        <p>
          Check whether a file matches its certificate, and whether that certificate's timestamp is
          really anchored in Bitcoin.
        </p>
      </div>
      <span class="secure-note">Checked in this browser</span>
    </div>

    <div class="flow-shell">
      <div class="flow-main">
        <div class="stepper">
          <button class="step" class:active={step === 1} class:done={step > 1} disabled>
            1 Add files
          </button>
          <button class="step" class:active={step === 2} disabled>2 Result</button>
        </div>

        {#if step === 1}
          <div class="flow-panel">
            <h2 class="panel-title">Add the document and its certificate</h2>
            <p class="panel-copy">
              Both are read on this device. Nothing is uploaded — checking a timestamp only queries
              public block explorers for a block that is already public.
            </p>

            <div class="verify-uploader">
              <FileDrop
                compact
                label="Original document"
                hint="The file the certificate was issued for"
                file={documentFile}
                onselect={(f) => {
                  documentFile = f;
                  reset();
                }}
              />
              <FileDrop
                compact
                icon="◇"
                label="Certificate 1, or the .ots proof"
                hint="The PDF is enough — the proof is embedded in it"
                accept=".pdf,.ots"
                file={proofFile}
                onselect={(f) => {
                  proofFile = f;
                  reset();
                }}
              />
            </div>

            {#if error}
              <div class="notice bad">{error}</div>
            {/if}

            <div class="flow-actions end">
              <button
                class="button dark"
                disabled={!documentFile || !proofFile || checking}
                onclick={check}
              >
                {#if checking}<span class="spinner"></span>{/if}
                {checking ? 'Checking…' : 'Verify'}
              </button>
            </div>
          </div>
        {:else if outcome}
          <div class="flow-panel">
            <div class="result-banner {tone}">
              <span class="result-icon" aria-hidden="true">
                {verdict === 'mismatch' ? '!' : verdict === 'proven' ? '✓' : '·'}
              </span>
              <div>
                {#if verdict === 'mismatch'}
                  <h3>Not verified — the document does not match</h3>
                  <p>
                    <strong>This certificate is not for this document.</strong> The file you supplied
                    hashes to a different value than the one the proof commits to. Either it was modified
                    after the certificate was issued, or these two files simply belong to different
                    documents. Do not sign.
                  </p>
                {:else if verdict === 'proven'}
                  <h3>Verified — the document matches</h3>
                  <p>
                    This document is byte-for-byte the one the certificate was issued for, and its
                    digest was anchored in the Bitcoin blockchain. It provably existed no later than
                    the attested time below.
                  </p>
                {:else if verdict === 'pending'}
                  <h3>Matches, but the timestamp is still pending</h3>
                  <p>
                    The document matches the certificate, but the timestamp is not yet anchored in
                    Bitcoin — the calendars have accepted it and are waiting for a block. Until that
                    happens the attested time rests on the calendars' promise rather than on the
                    blockchain. Ask the creator to re-issue the certificate once it confirms, or
                    check again in a few hours.
                  </p>
                {:else}
                  <h3>Matches, but the anchor was not checked</h3>
                  <p>
                    The document matches the certificate, and the proof is attested — but this
                    device did not confirm that attestation: {outcome.status.kind === 'unverified'
                      ? outcome.status.reason
                      : ''}
                    Check your connection and try again, or verify independently with the reference
                    client.
                  </p>
                {/if}
              </div>
            </div>

            <div class="review-box" style="margin-top:18px">
              <div class="review-row">
                <span>Document</span>
                <strong>{documentFile?.name} · {formatBytes(documentFile?.size ?? 0)}</strong>
              </div>
              <div class="review-row">
                <span>Document SHA-256</span>
                <strong class="mono">{groupHex(outcome.documentDigest)}</strong>
              </div>
              <div class="review-row">
                <span>Proof commits to</span>
                <strong class="mono">{groupHex(outcome.proofDigest)}</strong>
              </div>
              <div class="review-row">
                <span>Proof read from</span>
                <strong>{outcome.proofSource}</strong>
              </div>
              <div class="review-row">
                <span>Timestamp</span>
                <div><StatusBadge status={outcome.status} /></div>
              </div>
              {#if outcome.status.kind === 'confirmed'}
                <div class="review-row">
                  <span>Attested time</span>
                  <strong>{utcStamp(outcome.status.blockTime)}</strong>
                </div>
                <div class="review-row">
                  <span>Bitcoin block</span>
                  <strong>
                    {outcome.status.blockHeights.join(', ')}
                    <span class="meta">(confirmed via {outcome.status.confirmedBy.join(', ')})</span
                    >
                  </strong>
                </div>
              {/if}
            </div>

            <div class="notice">
              Want to check this without trusting xNotary? Install the reference client
              (<code>pip install opentimestamps-client</code>) and run
              <code>ots verify -f "{documentFile?.name}" proof.ots</code>. The instructions are also
              printed on the certificate itself.
            </div>

            <details class="raw">
              <summary>OpenTimestamps proof tree</summary>
              <pre>{outcome.proofText}</pre>
            </details>

            <div class="flow-actions">
              <button class="button ghost-dark" onclick={reset}>← Change files</button>
              <button
                class="button dark"
                onclick={() => {
                  documentFile = null;
                  proofFile = null;
                  reset();
                }}>Verify another document</button
              >
            </div>
          </div>
        {/if}
      </div>

      <aside class="side-card">
        <h3>What “verified” means</h3>
        <p>
          That the file matches the fingerprint the certificate commits to, and that the proof can
          be independently checked against Bitcoin. Nothing more.
        </p>
        <div class="side-list">
          <div>Exact document match</div>
          <div>Timestamp status, as far as it was checked</div>
          <div>Nothing about who signed — that is Certificate 2</div>
          <div>Nothing about what the document says or means</div>
        </div>
      </aside>
    </div>
  </div>
</section>
