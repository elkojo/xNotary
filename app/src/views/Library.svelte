<script lang="ts">
  import StatusBadge from '../components/StatusBadge.svelte';
  import { buildCertificate1 } from '../lib/certificate1';
  import { baseName, downloadBytes, formatBytes, formatDate } from '../lib/download';
  import { fromHex, groupHex } from '../lib/hash';
  import {
    deleteCertificate,
    listCertificates,
    putCertificate,
    storageEstimate,
    type CertificateRecord,
  } from '../lib/library';
  import { checkStatus, parseOts, upgradeProof } from '../lib/ots';

  interface Props {
    /** Bumped by the parent whenever a certificate is added, to force a reload. */
    revision: number;
  }
  let { revision }: Props = $props();

  let records = $state<CertificateRecord[]>([]);
  let loading = $state(true);
  let busyId = $state<string | null>(null);
  let message = $state<{ tone: 'ok' | 'bad' | ''; text: string } | null>(null);
  let storage = $state<{ usage: number; quota: number } | null>(null);
  let expanded = $state<string | null>(null);
  let confirmingDelete = $state<string | null>(null);

  async function load() {
    loading = true;
    records = await listCertificates();
    storage = await storageEstimate();
    loading = false;
  }

  // Reload when the parent signals a new certificate was stored.
  $effect(() => {
    void revision;
    void load();
  });

  const pendingCount = $derived(records.filter((r) => r.status.kind !== 'confirmed').length);

  /**
   * Re-fetch the proof from the calendars and, if it has been anchored since,
   * rewrite both the `.ots` and the certificate PDF so the saved certificate
   * states the Bitcoin-attested time rather than "pending".
   */
  async function upgradeOne(record: CertificateRecord): Promise<'upgraded' | 'unchanged'> {
    const timestamp = parseOts(record.ots);
    const { timestamp: upgraded, ots, changed } = await upgradeProof(timestamp);
    const status = await checkStatus(upgraded);

    const wasConfirmed = record.status.kind === 'confirmed';
    const nowConfirmed = status.kind === 'confirmed';
    if (!changed && wasConfirmed === nowConfirmed) return 'unchanged';

    const pdf = await buildCertificate1({
      fileName: record.fileName,
      fileSize: record.fileSize,
      digest: fromHex(record.id),
      ots,
      requestedAt: new Date(record.createdAt),
      status,
      note: record.note,
    });

    await putCertificate({ ...record, ots, pdf, status, updatedAt: Date.now() });
    return 'upgraded';
  }

  async function upgradeClicked(record: CertificateRecord) {
    busyId = record.id;
    message = null;
    try {
      const outcome = await upgradeOne(record);
      await load();
      message =
        outcome === 'upgraded'
          ? { tone: 'ok', text: `“${record.fileName}” upgraded. Re-download the certificate below.` }
          : {
              tone: '',
              text: `“${record.fileName}” is not in a Bitcoin block yet. Bitcoin blocks are ~10 minutes apart and the calendars batch submissions, so this normally takes a few hours.`,
            };
    } catch (e) {
      message = { tone: 'bad', text: e instanceof Error ? e.message : String(e) };
    } finally {
      busyId = null;
    }
  }

  async function upgradeAll() {
    busyId = '*';
    message = null;
    let upgraded = 0;
    const failures: string[] = [];
    for (const record of records.filter((r) => r.status.kind !== 'confirmed')) {
      try {
        if ((await upgradeOne(record)) === 'upgraded') upgraded++;
      } catch (e) {
        failures.push(`${record.fileName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await load();
    busyId = null;
    message = failures.length
      ? { tone: 'bad', text: `${upgraded} upgraded. Failed: ${failures.join('; ')}` }
      : {
          tone: upgraded ? 'ok' : '',
          text: upgraded
            ? `${upgraded} certificate(s) upgraded. Re-download them below.`
            : 'Nothing has been anchored yet. Try again later.',
        };
  }

  async function remove(record: CertificateRecord) {
    await deleteCertificate(record.id);
    confirmingDelete = null;
    await load();
    message = {
      tone: '',
      text: `“${record.fileName}” removed from this device. Any copies you exported are unaffected.`,
    };
  }
</script>

<div class="card">
  <h2>My certificates</h2>
  <p class="hint">
    Stored in this browser only — xNotary has no server. Clearing site data, or using a different
    browser or device, will not find them. Export anything you want to keep.
  </p>

  {#if pendingCount > 0}
    <div class="actions">
      <button onclick={upgradeAll} disabled={busyId !== null}>
        {#if busyId === '*'}<span class="spinner"></span>{/if}
        Upgrade {pendingCount} pending proof{pendingCount === 1 ? '' : 's'}
      </button>
    </div>
  {/if}

  {#if message}
    <div class="notice {message.tone}">{message.text}</div>
  {/if}

  {#if storage}
    <p class="hint" style="margin-top:.75rem">
      Using {formatBytes(storage.usage)} of roughly {formatBytes(storage.quota)} available to this site.
    </p>
  {/if}
</div>

{#if loading}
  <div class="empty">Loading…</div>
{:else if records.length === 0}
  <div class="empty">
    No certificates yet. Notarize a file to create your first one.
  </div>
{:else}
  <div class="list">
    {#each records as record (record.id)}
      <div class="item" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;flex-wrap:wrap">
          <div>
            <strong>{record.fileName}</strong>
            <div class="meta">
              {formatBytes(record.fileSize)} · notarized {formatDate(record.createdAt)}
              {#if record.note}· {record.note}{/if}
            </div>
          </div>
          <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
            <StatusBadge status={record.status} />
            <button
              class="link"
              onclick={() => (expanded = expanded === record.id ? null : record.id)}
            >
              {expanded === record.id ? 'Hide' : 'Details'}
            </button>
          </div>
        </div>

        {#if expanded === record.id}
          <div class="rows" style="margin-top:.9rem">
            <div class="row">
              <span>SHA-256</span>
              <span class="value mono">{groupHex(record.id)}</span>
            </div>
            {#if record.status.kind === 'confirmed'}
              <div class="row">
                <span>Attested time</span>
                <span class="value">{record.status.blockTime.toUTCString()}</span>
              </div>
              <div class="row">
                <span>Bitcoin block</span>
                <span class="value">{record.status.blockHeights.join(', ')}</span>
              </div>
            {:else if record.status.kind === 'pending'}
              <div class="row">
                <span>Waiting on</span>
                <span class="value">{record.status.calendars.join(', ')}</span>
              </div>
            {:else}
              <div class="row">
                <span>Not checked</span>
                <span class="value">{record.status.reason}</span>
              </div>
            {/if}
            {#if record.updatedAt !== record.createdAt}
              <div class="row">
                <span>Proof updated</span>
                <span class="value">{formatDate(record.updatedAt)}</span>
              </div>
            {/if}
          </div>

          <div class="actions">
            <button
              onclick={() =>
                downloadBytes(
                  record.pdf,
                  `${baseName(record.fileName)} — Certificate 1.pdf`,
                  'application/pdf',
                )}>Certificate 1 (PDF)</button
            >
            <button
              onclick={() =>
                downloadBytes(
                  record.ots,
                  `${record.fileName}.ots`,
                  'application/vnd.opentimestamps.ots',
                )}>Proof (.ots)</button
            >
            {#if record.status.kind !== 'confirmed'}
              <button onclick={() => upgradeClicked(record)} disabled={busyId !== null}>
                {#if busyId === record.id}<span class="spinner"></span>{/if}
                Upgrade proof
              </button>
            {/if}
            {#if confirmingDelete === record.id}
              <button class="danger" onclick={() => remove(record)}>
                Delete permanently — this cannot be undone
              </button>
              <button class="link" onclick={() => (confirmingDelete = null)}>Cancel</button>
            {:else}
              <button class="danger" onclick={() => (confirmingDelete = record.id)}>Delete</button>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
