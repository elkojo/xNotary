<script lang="ts">
  /**
   * "Verify integrity" — the screen a signer uses after receiving a document and
   * a Certificate 1 out of band. It answers two separate questions:
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
</script>

<div class="card">
  <h2>Verify integrity</h2>
  <p class="hint">
    Received a document and a Certificate 1? Check here that the certificate really belongs to that
    exact document, and that its timestamp is anchored in Bitcoin. Everything is checked on this
    device; nothing is uploaded.
  </p>

  <div style="display:grid;gap:.75rem;margin-top:1rem">
    <FileDrop
      label="1. The document"
      hint="The original file the certificate was issued for"
      file={documentFile}
      onselect={(f) => {
        documentFile = f;
        reset();
      }}
    />
    <FileDrop
      label="2. Certificate 1 (PDF) or the .ots proof"
      hint="The PDF is enough — the proof is embedded inside it"
      accept=".pdf,.ots"
      file={proofFile}
      onselect={(f) => {
        proofFile = f;
        reset();
      }}
    />
  </div>

  <div class="actions">
    <button class="primary" disabled={!documentFile || !proofFile || checking} onclick={check}>
      {#if checking}<span class="spinner"></span>{/if}
      {checking ? 'Checking…' : 'Verify'}
    </button>
  </div>

  {#if error}
    <div class="notice bad">{error}</div>
  {/if}
</div>

{#if outcome}
  <div class="card">
    {#if verdict === 'mismatch'}
      <h2><span class="badge bad">Does not match</span></h2>
      <div class="notice bad">
        <strong>This certificate is not for this document.</strong> The document you supplied hashes
        to a different value than the one the proof commits to. Either the file was modified after the
        certificate was issued, or these two files simply belong to different documents. Do not sign.
      </div>
    {:else if verdict === 'proven'}
      <h2><span class="badge ok">Verified</span></h2>
      <div class="notice ok">
        This document is byte-for-byte the one the certificate was issued for, and its digest was
        anchored in the Bitcoin blockchain. It provably existed no later than the attested time
        below.
      </div>
    {:else if verdict === 'pending'}
      <h2><span class="badge pending">Matches, timestamp still pending</span></h2>
      <div class="notice warn">
        The document matches the certificate, but the timestamp is not yet anchored in Bitcoin — the
        calendars have accepted it and are waiting for a block. Until that happens the attested time
        rests on the calendars' promise rather than on the blockchain. Ask the creator to re-issue
        the certificate once it confirms, or check again in a few hours.
      </div>
    {:else}
      <h2><span class="badge muted">Matches, anchor not checked</span></h2>
      <div class="notice">
        The document matches the certificate, and the proof is attested — but this device did not
        confirm that attestation: {outcome.status.kind === 'unverified' ? outcome.status.reason : ''}
        Check your connection and try again, or verify independently with the reference client.
      </div>
    {/if}

    <div class="rows" style="margin-top:1rem">
      <div class="row">
        <span>Document</span>
        <span class="value">{documentFile?.name} · {formatBytes(documentFile?.size ?? 0)}</span>
      </div>
      <div class="row">
        <span>Document SHA-256</span>
        <span class="value mono">{groupHex(outcome.documentDigest)}</span>
      </div>
      <div class="row">
        <span>Proof commits to</span>
        <span class="value mono">{groupHex(outcome.proofDigest)}</span>
      </div>
      <div class="row">
        <span>Proof read from</span>
        <span class="value">{outcome.proofSource}</span>
      </div>
      <div class="row">
        <span>Timestamp</span>
        <span class="value"><StatusBadge status={outcome.status} /></span>
      </div>
      {#if outcome.status.kind === 'confirmed'}
        <div class="row">
          <span>Attested time</span>
          <span class="value">{outcome.status.blockTime.toUTCString()}</span>
        </div>
        <div class="row">
          <span>Bitcoin block</span>
          <span class="value">
            {outcome.status.blockHeights.join(', ')}
            <span class="meta">(confirmed via {outcome.status.confirmedBy.join(', ')})</span>
          </span>
        </div>
      {/if}
    </div>

    <div class="notice">
      Want to check this without trusting xNotary? Install the reference client
      (<code>pip install opentimestamps-client</code>) and run
      <code>ots verify -f "{documentFile?.name}" proof.ots</code>. The instructions are also printed
      on the certificate itself.
    </div>

    <details class="raw" style="margin-top:1rem">
      <summary>OpenTimestamps proof tree</summary>
      <pre>{outcome.proofText}</pre>
    </details>
  </div>
{/if}

<style>
  .meta {
    color: var(--muted);
    font-size: 0.82rem;
  }
</style>
