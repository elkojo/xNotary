<script lang="ts">
  import FileDrop from '../components/FileDrop.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import { buildCertificate1 } from '../lib/certificate1';
  import { baseName, downloadBytes, formatBytes } from '../lib/download';
  import { groupHex, sha256File, toHex } from '../lib/hash';
  import { putCertificate, requestPersistence, type CertificateRecord } from '../lib/library';
  import { checkStatus, describeProof, parseOts, stamp, type OtsStatus } from '../lib/ots';

  interface Props {
    onstored: () => void;
  }
  let { onstored }: Props = $props();

  type Phase = 'idle' | 'hashing' | 'stamping' | 'building' | 'done' | 'error';

  let file = $state<File | null>(null);
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

  function reset() {
    phase = 'idle';
    error = '';
    hashProgress = 0;
    calendarWarnings = [];
    result = null;
  }

  function pick(chosen: File) {
    reset();
    file = chosen;
  }

  async function notarize() {
    if (!file) return;
    const chosen = file;
    reset();

    try {
      // 1. Hash locally. The file itself never leaves the device.
      phase = 'hashing';
      const digest = await sha256File(chosen, (read, total) => {
        hashProgress = total === 0 ? 1 : read / total;
      });
      const digestHex = toHex(digest);

      // 2. Submit only the digest to the OpenTimestamps calendars.
      phase = 'stamping';
      const stamped = await stamp(digest);
      calendarWarnings = [...stamped.errors];

      // A fresh stamp is always pending, but check anyway: re-stamping a digest
      // that a calendar already anchored can come back complete.
      const status = await checkStatus(stamped.timestamp);

      // 3. Build Certificate 1 around the proof.
      phase = 'building';
      const requestedAt = new Date();
      const pdf = await buildCertificate1({
        fileName: chosen.name,
        fileSize: chosen.size,
        digest,
        ots: stamped.ots,
        requestedAt,
        status,
        note: note.trim() || undefined,
      });

      // 4. Keep it in the local library.
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
      phase = 'done';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      phase = 'error';
    }
  }

  const busy = $derived(phase === 'hashing' || phase === 'stamping' || phase === 'building');
</script>

<div class="card">
  <h2>Notarize a file</h2>
  <p class="hint">
    The file is hashed on this device and only the 32-byte SHA-256 digest is sent to the
    OpenTimestamps calendars. The file itself never leaves your device.
  </p>

  <div style="margin-top:1rem">
    <FileDrop
      label="Drop a file here, or click to choose"
      hint="Any file type. Large files are hashed in chunks."
      {file}
      onselect={pick}
    />
  </div>

  {#if file}
    <div style="margin-top:1rem">
      <label for="note" style="font-size:.88rem;color:var(--muted)">
        Note (optional — appears on the certificate)
      </label>
      <input id="note" type="text" bind:value={note} placeholder="e.g. Lease agreement, v3" />
    </div>
  {/if}

  <div class="actions">
    <button class="primary" disabled={!file || busy} onclick={notarize}>
      {#if busy}<span class="spinner"></span>{/if}
      {phase === 'hashing'
        ? `Hashing… ${Math.round(hashProgress * 100)}%`
        : phase === 'stamping'
          ? 'Submitting to calendars…'
          : phase === 'building'
            ? 'Building certificate…'
            : 'Create Certificate 1'}
    </button>
    {#if result}
      <button
        onclick={() => {
          file = null;
          note = '';
          reset();
        }}>Notarize another</button
      >
    {/if}
  </div>

  {#if phase === 'hashing'}
    <div class="progress"><div style="width:{hashProgress * 100}%"></div></div>
  {/if}

  {#if error}
    <div class="notice bad"><strong>Could not create the certificate.</strong> {error}</div>
  {/if}
</div>

{#if result}
  <div class="card">
    <h2>Certificate 1 created <StatusBadge status={result.status} /></h2>

    <div class="rows" style="margin-top:1rem">
      <div class="row">
        <span>File</span>
        <span class="value">{result.record.fileName} · {formatBytes(result.record.fileSize)}</span>
      </div>
      <div class="row">
        <span>SHA-256</span>
        <span class="value mono">{groupHex(result.digestHex)}</span>
      </div>
      {#if result.status.kind === 'confirmed'}
        <div class="row">
          <span>Attested time</span>
          <span class="value">{result.status.blockTime.toUTCString()}</span>
        </div>
        <div class="row">
          <span>Bitcoin block</span>
          <span class="value">{result.status.blockHeights.join(', ')}</span>
        </div>
      {:else if result.status.kind === 'pending'}
        <div class="row">
          <span>Calendars</span>
          <span class="value">{result.status.calendars.length} accepted the digest</span>
        </div>
      {/if}
    </div>

    {#if result.status.kind === 'pending'}
      <div class="notice warn">
        <strong>The proof is not yet anchored in Bitcoin.</strong> The calendars have committed to
        including your digest in a Bitcoin transaction; this usually completes within a few hours.
        Come back to <em>My certificates</em> and press <em>Upgrade</em> — the attested time will
        then be the time of the Bitcoin block, and the certificate will be verifiable by anyone with
        no calendar involved.
      </div>
    {/if}

    {#if calendarWarnings.length}
      <div class="notice">
        Some calendars did not respond ({calendarWarnings.length}). The proof is still valid — it
        only needs one. <details class="raw">
          <summary>Details</summary>
          <pre>{calendarWarnings.join('\n')}</pre>
        </details>
      </div>
    {/if}

    <div class="actions">
      <button
        class="primary"
        onclick={() =>
          downloadBytes(
            result!.record.pdf,
            `${baseName(result!.record.fileName)} — Certificate 1.pdf`,
            'application/pdf',
          )}>Save Certificate 1 (PDF)</button
      >
      <button
        onclick={() =>
          downloadBytes(
            result!.record.ots,
            `${result!.record.fileName}.ots`,
            'application/vnd.opentimestamps.ots',
          )}>Save proof (.ots)</button
      >
    </div>

    <div class="notice">
      <strong>Back these up.</strong> xNotary has no server and no copy of your data. The certificate
      is stored in this browser only. The <code>.ots</code> proof is also embedded inside the PDF, so
      the PDF alone is enough to verify — but keep the original file, or there is nothing to verify against.
    </div>

    <details class="raw" style="margin-top:1rem">
      <summary>OpenTimestamps proof tree</summary>
      <pre>{result.proofText}</pre>
    </details>
  </div>
{/if}
