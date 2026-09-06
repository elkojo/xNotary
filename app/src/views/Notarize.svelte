<script lang="ts">
  /**
   * "Timestamp" — Certificate 1, in three steps: choose the file, look at what
   * is about to be published, create the proof.
   *
   * The digest is computed at step 1 rather than on submit, so the review step
   * can show the fingerprint the user is actually about to send. Hashing is
   * local and costs nothing but time; nothing leaves the device until the
   * button on step 2.
   */
  import FileDrop from '../components/FileDrop.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import { buildCertificate1 } from '../lib/certificate1';
  import { baseName, downloadBytes, formatBytes } from '../lib/download';
  import { groupHex, sha256File, toHex } from '../lib/hash';
  import { putCertificate, requestPersistence, type CertificateRecord } from '../lib/library';
  import { checkStatus, describeProof, parseOts, stamp, type OtsStatus } from '../lib/ots';
  import { utcStamp } from '../lib/time';
  import type { View } from '../nav';

  interface Props {
    onstored: () => void;
    go: (view: View) => void;
  }
  let { onstored, go }: Props = $props();

  type Phase = 'idle' | 'hashing' | 'stamping' | 'building' | 'error';

  let file = $state<File | null>(null);
  let digest = $state<Uint8Array | null>(null);
  let digestHex = $state('');
  let note = $state('');
  let phase = $state<Phase>('idle');
  let hashProgress = $state(0);
  let error = $state('');
  let calendarWarnings = $state<string[]>([]);

  let result = $state<{
    record: CertificateRecord;
    digestHex: string;
    status: OtsStatus;
    proofText: string;
  } | null>(null);

  const step = $derived(result ? 3 : digest ? 2 : 1);
  const busy = $derived(phase === 'hashing' || phase === 'stamping' || phase === 'building');

  function startOver() {
    file = null;
    digest = null;
    digestHex = '';
    note = '';
    phase = 'idle';
    hashProgress = 0;
    error = '';
    calendarWarnings = [];
    result = null;
  }

  /** Hash on selection, so step 2 can show the digest before anything is sent. */
  async function pick(chosen: File) {
    startOver();
    file = chosen;
    phase = 'hashing';
    try {
      const bytes = await sha256File(chosen, (read, total) => {
        hashProgress = total === 0 ? 1 : read / total;
      });
      digest = bytes;
      digestHex = toHex(bytes);
      phase = 'idle';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      phase = 'error';
    }
  }

  async function notarize() {
    if (!file || !digest) return;
    const chosen = file;
    const chosenDigest = digest;
    error = '';
    calendarWarnings = [];

    try {
      // Only the 32-byte digest goes to the OpenTimestamps calendars.
      phase = 'stamping';
      const stamped = await stamp(chosenDigest);
      calendarWarnings = [...stamped.errors];

      // A fresh stamp is always pending, but check anyway: re-stamping a digest
      // that a calendar already anchored can come back complete.
      const status = await checkStatus(stamped.timestamp);

      phase = 'building';
      const requestedAt = new Date();
      const pdf = await buildCertificate1({
        fileName: chosen.name,
        fileSize: chosen.size,
        digest: chosenDigest,
        ots: stamped.ots,
        requestedAt,
        status,
        note: note.trim() || undefined,
      });

      // Keep it in the local library — the one thing xNotary stores, and only
      // so a pending timestamp can be upgraded to confirmed later.
      const record: CertificateRecord = {
        id: digestHex,
        fileName: chosen.name,
        fileSize: chosen.size,
        note: note.trim() || undefined,
        createdAt: requestedAt.getTime(),
        updatedAt: requestedAt.getTime(),
        ots: stamped.ots,
        pdf,
        status,
      };
      await putCertificate(record);
      await requestPersistence();
      onstored();

      result = {
        record,
        digestHex,
        status,
        proofText: describeProof(parseOts(stamped.ots)),
      };
      phase = 'idle';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      phase = 'error';
    }
  }
</script>

<section class="product-view">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>Timestamp a document</h1>
        <p>
          Create independent proof that an exact file existed at a specific time, anchored in the
          Bitcoin blockchain.
        </p>
      </div>
      <span class="secure-note">Processed in this browser</span>
    </div>

    <div class="flow-shell">
      <div class="flow-main">
        <div class="stepper">
          <button class="step" class:active={step === 1} class:done={step > 1} disabled>
            1 Choose file
          </button>
          <button class="step" class:active={step === 2} class:done={step > 2} disabled>
            2 Review
          </button>
          <button class="step" class:active={step === 3} disabled>3 Certificate</button>
        </div>

        {#if step === 1}
          <div class="flow-panel">
            <h2 class="panel-title">Choose the file you want to prove</h2>
            <p class="panel-copy">
              We calculate its unique fingerprint on this device. The document itself is never
              uploaded.
            </p>

            <FileDrop
              label="Drop a file here"
              hint="Any file type. Large files are hashed in chunks."
              onselect={pick}
            />

            {#if phase === 'hashing'}
              <div class="progress"><div style="width:{hashProgress * 100}%"></div></div>
              <p class="field-help">Hashing… {Math.round(hashProgress * 100)}%</p>
            {/if}

            {#if error}
              <div class="notice bad"><strong>Could not read that file.</strong> {error}</div>
            {/if}
          </div>
        {:else if step === 2}
          <div class="flow-panel">
            <h2 class="panel-title">Review before creating proof</h2>
            <p class="panel-copy">
              This fingerprint identifies this exact version. Any change to the file produces a
              different one.
            </p>

            <div class="review-box">
              <div class="review-row">
                <span>File</span>
                <strong>{file?.name} · {formatBytes(file?.size ?? 0)}</strong>
              </div>
              <div class="review-row">
                <span>Fingerprint</span>
                <strong class="mono">{groupHex(digestHex)}</strong>
              </div>
              <div class="review-row">
                <span>Sent</span>
                <strong>Only the digest above, to public OpenTimestamps calendars.</strong>
              </div>
            </div>

            <div class="field">
              <label for="note">Note (optional)</label>
              <input
                id="note"
                class="input"
                type="text"
                bind:value={note}
                placeholder="e.g. Lease agreement, v3"
              />
              <p class="field-help">
                The note is printed on the certificate. It is not sent to the calendars.
              </p>
            </div>

            <div class="flow-actions">
              <button class="button ghost-dark" disabled={busy} onclick={startOver}>
                ← Choose another file
              </button>
              <button class="button dark" disabled={busy} onclick={notarize}>
                {#if busy}<span class="spinner"></span>{/if}
                {phase === 'stamping'
                  ? 'Submitting to calendars…'
                  : phase === 'building'
                    ? 'Building certificate…'
                    : 'Create Certificate 1'}
              </button>
            </div>

            {#if error}
              <div class="notice bad">
                <strong>Could not create the certificate.</strong>
                {error}
              </div>
            {/if}
          </div>
        {:else if result}
          <div class="flow-panel">
            <div class="success">
              <div class="success-mark" aria-hidden="true">✓</div>
              <h2>Certificate 1 created</h2>
              <p>
                {#if result.status.kind === 'confirmed'}
                  This certificate proves that your exact document existed no later than
                  <strong>{utcStamp(result.status.blockTime)}</strong>.
                {:else}
                  The calendars have accepted your fingerprint. The attested time becomes provable
                  once it reaches a Bitcoin block — usually within a few hours.
                {/if}
              </p>

              <div class="certificate-mini">
                <div class="review-row">
                  <span>Status</span>
                  <div><StatusBadge status={result.status} /></div>
                </div>
                <div class="review-row">
                  <span>Document</span>
                  <strong>{result.record.fileName}</strong>
                </div>
                <div class="review-row">
                  <span>Fingerprint</span>
                  <strong class="mono">{groupHex(result.digestHex)}</strong>
                </div>
                {#if result.status.kind === 'confirmed'}
                  <div class="review-row">
                    <span>Attested time</span>
                    <strong>{utcStamp(result.status.blockTime)}</strong>
                  </div>
                  <div class="review-row">
                    <span>Bitcoin block</span>
                    <strong>{result.status.blockHeights.join(', ')}</strong>
                  </div>
                {:else if result.status.kind === 'pending'}
                  <div class="review-row">
                    <span>Calendars</span>
                    <strong>{result.status.calendars.length} accepted the digest</strong>
                  </div>
                {/if}
              </div>

              <div class="success-actions">
                <button
                  class="button dark"
                  onclick={() =>
                    downloadBytes(
                      result!.record.pdf,
                      `${baseName(result!.record.fileName)} — Certificate 1.pdf`,
                      'application/pdf',
                    )}>Save Certificate 1 (PDF)</button
                >
                <button
                  class="button ghost-dark"
                  onclick={() =>
                    downloadBytes(
                      result!.record.ots,
                      `${result!.record.fileName}.ots`,
                      'application/vnd.opentimestamps.ots',
                    )}>Save proof (.ots)</button
                >
              </div>
              <p class="keep-note">
                Keep the original file. A certificate proves it; it cannot restore it.
              </p>
            </div>

            {#if result.status.kind === 'pending'}
              <div class="notice warn">
                <strong>Not yet in a Bitcoin block.</strong> Come back to
                <button class="link-button" onclick={() => go('library')}>My certificates</button>
                in a few hours and press <em>Upgrade</em> — the certificate will then state the
                block's own time, and verify with no calendar involved.
              </div>
            {/if}

            {#if calendarWarnings.length}
              <div class="notice">
                Some calendars did not respond ({calendarWarnings.length}). The proof is still valid
                — it only needs one.
                <details class="raw">
                  <summary>Details</summary>
                  <pre>{calendarWarnings.join('\n')}</pre>
                </details>
              </div>
            {/if}

            <div class="notice">
              <strong>Back these up.</strong> The certificate lives in this browser only — xNotary
              keeps no copy. The proof is embedded in the PDF, so the PDF alone verifies; keep the
              original file too, or there is nothing to check it against.
            </div>

            <details class="raw">
              <summary>OpenTimestamps proof tree</summary>
              <pre>{result.proofText}</pre>
            </details>

            <div class="flow-actions end">
              <button class="button ghost-dark" onclick={startOver}>Timestamp another file</button>
            </div>
          </div>
        {/if}
      </div>

      <aside class="side-card">
        <h3>What you get</h3>
        <p>
          A certificate anyone can verify against the original — with the reference client, no
          xNotary involved.
        </p>
        <div class="side-list">
          <div>The document's SHA-256 fingerprint</div>
          <div>An independent time proof, anchored in Bitcoin</div>
          <div>The proof file embedded in the PDF</div>
          <div>Printed instructions for verifying it elsewhere</div>
        </div>
      </aside>
    </div>
  </div>
</section>
