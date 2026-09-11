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
  import { utcStamp } from '../lib/time';
  import type { View } from '../nav';

  interface Props {
    /** Bumped by the parent whenever a certificate is added, to force a reload. */
    revision: number;
    go: (view: View) => void;
  }
  let { revision, go }: Props = $props();

  let records = $state<CertificateRecord[]>([]);
  let loaded = $state(false);
  let busyId = $state<string | null>(null);
  let message = $state<{ tone: 'ok' | 'bad' | ''; text: string } | null>(null);
  let storage = $state<{ usage: number; quota: number } | null>(null);
  let expanded = $state<string | null>(null);
  let confirmingDelete = $state<string | null>(null);
  let filter = $state('');

  /**
   * `loaded` only ever goes false → true, and is never reset for a reload: an
   * upgrade or a delete re-reads the store, and blanking the list to "Loading…"
   * while it does is a worse answer than leaving the rows that are already
   * correct on screen.
   *
   * The list is also not gated on the storage estimate.
   * `navigator.storage.estimate()` is slow in some browsers, and a number at
   * the foot of the page is not worth withholding the page for.
   */
  async function load() {
    records = await listCertificates();
    loaded = true;
    storage = await storageEstimate();
  }

  // Reload when the parent signals a new certificate was stored.
  $effect(() => {
    void revision;
    void load();
  });

  const pendingCount = $derived(records.filter((r) => r.status.kind !== 'confirmed').length);

  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.fileName.toLowerCase().includes(q) ||
        r.id.includes(q) ||
        (r.note ?? '').toLowerCase().includes(q),
    );
  });

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

<section class="product-view">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>My certificates</h1>
        <p>
          Kept in this browser, on this address, so pending timestamps can be upgraded. Save what
          you want to keep — this is not a backup.
        </p>
      </div>
      <button class="button dark" onclick={() => go('notarize')}>Timestamp a document</button>
    </div>

    <div class="list-card">
      {#if records.length > 0}
        <div class="list-toolbar">
          <input
            class="search"
            type="text"
            placeholder="Search by name, note or fingerprint"
            bind:value={filter}
            aria-label="Search certificates"
          />
          {#if pendingCount > 0}
            <button class="button ghost-dark small" onclick={upgradeAll} disabled={busyId !== null}>
              {#if busyId === '*'}<span class="spinner"></span>{/if}
              Upgrade {pendingCount} pending proof{pendingCount === 1 ? '' : 's'}
            </button>
          {/if}
        </div>
      {/if}

      {#if !loaded}
        <div class="empty">Loading…</div>
      {:else if records.length === 0}
        <div class="empty">No certificates yet. Timestamp a file to create your first one.</div>
      {:else if shown.length === 0}
        <div class="empty">Nothing here matches “{filter}”.</div>
      {:else}
        <div class="table-head">
          <span>Document</span>
          <span>Notarized</span>
          <span>Size</span>
          <span>Status</span>
          <span></span>
        </div>

        {#each shown as record (record.id)}
          <div>
            <div class="table-row">
              <div>
                <span class="doc-name">{record.fileName}</span>
                <span class="doc-hash">{record.id.slice(0, 32)}…</span>
              </div>
              <span class="table-value">{formatDate(record.createdAt)}</span>
              <span class="table-value">{formatBytes(record.fileSize)}</span>
              <StatusBadge status={record.status} />
              <button
                class="more"
                aria-expanded={expanded === record.id}
                aria-label={expanded === record.id
                  ? `Hide details for ${record.fileName}`
                  : `Show details for ${record.fileName}`}
                onclick={() => (expanded = expanded === record.id ? null : record.id)}
              >
                {expanded === record.id ? '⌃' : '⋯'}
              </button>
            </div>

            {#if expanded === record.id}
              <div class="row-detail">
                <div class="review-box">
                  <div class="review-row">
                    <span>SHA-256</span>
                    <strong class="mono">{groupHex(record.id)}</strong>
                  </div>
                  {#if record.note}
                    <div class="review-row">
                      <span>Note</span>
                      <strong>{record.note}</strong>
                    </div>
                  {/if}
                  {#if record.status.kind === 'confirmed'}
                    <div class="review-row">
                      <span>Attested time</span>
                      <strong>{utcStamp(record.status.blockTime)}</strong>
                    </div>
                    <div class="review-row">
                      <span>Bitcoin block</span>
                      <strong>{record.status.blockHeights.join(', ')}</strong>
                    </div>
                  {:else if record.status.kind === 'pending'}
                    <div class="review-row">
                      <span>Waiting on</span>
                      <strong>{record.status.calendars.join(', ')}</strong>
                    </div>
                  {:else}
                    <div class="review-row">
                      <span>Not checked</span>
                      <strong>{record.status.reason}</strong>
                    </div>
                  {/if}
                  {#if record.updatedAt !== record.createdAt}
                    <div class="review-row">
                      <span>Proof updated</span>
                      <strong>{formatDate(record.updatedAt)}</strong>
                    </div>
                  {/if}
                </div>

                <div class="flow-actions end" style="margin-top:16px">
                  <button
                    class="button ghost-dark small"
                    onclick={() =>
                      downloadBytes(
                        record.pdf,
                        `${baseName(record.fileName)} — Certificate 1.pdf`,
                        'application/pdf',
                      )}>Certificate 1 (PDF)</button
                  >
                  <button
                    class="button ghost-dark small"
                    onclick={() =>
                      downloadBytes(
                        record.ots,
                        `${record.fileName}.ots`,
                        'application/vnd.opentimestamps.ots',
                      )}>Proof (.ots)</button
                  >
                  {#if record.status.kind !== 'confirmed'}
                    <button
                      class="button ghost-dark small"
                      onclick={() => upgradeClicked(record)}
                      disabled={busyId !== null}
                    >
                      {#if busyId === record.id}<span class="spinner"></span>{/if}
                      Upgrade proof
                    </button>
                  {/if}
                  {#if confirmingDelete === record.id}
                    <button class="button danger small" onclick={() => remove(record)}>
                      Delete permanently — this cannot be undone
                    </button>
                    <button class="link-button" onclick={() => (confirmingDelete = null)}>
                      Cancel
                    </button>
                  {:else}
                    <button
                      class="button danger small"
                      onclick={() => (confirmingDelete = record.id)}
                    >
                      Delete
                    </button>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    {#if message}
      <div class="notice {message.tone}">{message.text}</div>
    {/if}

    <div class="storage-note">
      Nothing here is uploaded — there is no xNotary backend. Clearing this browser's data removes them{#if storage && records.length > 0}
        ({formatBytes(storage.usage)} of ~{formatBytes(storage.quota)}){/if}.
    </div>
  </div>
</section>
