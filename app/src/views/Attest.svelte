<script lang="ts">
  /**
   * "Attest" — Certificate 2. Takes a signed PDF (normally a Certificate 1 that
   * has been signed), shows what signatures it contains, and asks per signature
   * whether that person may be named on the certificate.
   *
   * The consent gate is the point of this screen, not a formality. Every box
   * starts unticked: a signature in a document is not consent to be listed in a
   * new one. Withheld signatures are still disclosed as a count, because a
   * certificate that silently omitted them would misrepresent the document.
   */
  import FileDrop from '../components/FileDrop.svelte';
  import { downloadBytes, formatBytes } from '../lib/download';
  import { groupHex, toHex } from '../lib/hash';
  import {
    AgreementError,
    VALIDATOR_URL,
    analyzeSignedDocuments,
    buildCertificate2,
    type Certificate2Draft,
  } from '../lib/certificate2';

  let files = $state<File[]>([]);
  let draft = $state<Certificate2Draft | null>(null);
  let consented = $state<boolean[]>([]);
  let busy = $state(false);
  let error = $state('');
  let built = $state<Uint8Array | null>(null);

  const chosen = $derived(consented.filter(Boolean).length);
  const withheld = $derived((draft?.signers.length ?? 0) - chosen);

  async function inspect(picked: File[]) {
    files = picked;
    draft = null;
    built = null;
    error = '';
    busy = true;
    try {
      const result = await analyzeSignedDocuments(
        await Promise.all(
          picked.map(async (f) => ({
            fileName: f.name,
            bytes: new Uint8Array(await f.arrayBuffer()),
          })),
        ),
      );
      if (result.signers.length === 0 && result.errors.length === 0) {
        throw new Error(
          picked.length === 1
            ? 'This PDF carries no signatures. Certificate 2 attests to signatures, so there is ' +
              'nothing yet to attest to — have the document signed first.'
            : 'None of these PDFs carries a signature. Certificate 2 attests to signatures, so ' +
              'there is nothing yet to attest to.',
        );
      }
      draft = result;
      // Nobody is opted in by default.
      consented = result.signers.map(() => false);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function create() {
    if (!draft) return;
    busy = true;
    error = '';
    try {
      built = await buildCertificate2({
        sources: draft.sources.map((s) => ({ fileName: s.fileName, bytes: s.bytes })),
        signers: draft.signers.filter((_, i) => consented[i]),
        withheldCount: withheld,
        generatedAt: new Date(),
        underlying: draft.underlying ?? undefined,
      });
    } catch (e) {
      error =
        e instanceof AgreementError
          ? `${e.message} Create a separate Certificate 2 for each document.`
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      busy = false;
    }
  }

  function reset() {
    files = [];
    draft = null;
    built = null;
    error = '';
  }

  function timeText(s: Certificate2Draft['signers'][number]): string {
    if (!s.signedAt) return 'no signing time recorded';
    const when = s.signedAt.toISOString();
    if (s.timeSource === 'claimed') return `${when} (signer's own claim)`;
    if (!s.timestampMatches) return `${when} — timestamp does not cover this signature`;
    return `${when} (timestamped)`;
  }
</script>

<div class="card">
  <h2>Create Certificate 2</h2>
  <p class="hint">
    Certificate 1 shows a document existed. Certificate 2 shows who put their name to it. Drop the
    signed PDFs — normally a Certificate 1 that has since been signed — and choose who may be
    named. Everything is read on this device; nothing is uploaded.
  </p>
  <p class="hint">
    Signing in parallel gives each signer their own copy to sign; drop all of them together and
    their signatures are pooled onto one certificate. Signing in sequence produces a single file
    carrying every signature — drop just that. Either way, xNotary first checks the files really
    are signatures over the same document, and refuses to combine them if they are not.
  </p>

  <div style="margin-top:1rem">
    <FileDrop
      label="Signed PDFs"
      hint="One Certificate 1 signed by everyone, or one copy per signer"
      accept=".pdf"
      multiple
      onselect={(f) => inspect([f])}
      onselectmany={inspect}
    />
    {#if files.length > 0}
      <p class="hint">
        {files.length} file{files.length === 1 ? '' : 's'}: {files.map((f) => f.name).join(', ')}
      </p>
    {/if}
  </div>

  {#if busy && !draft}
    <div class="actions"><span class="spinner"></span> Reading signatures…</div>
  {/if}

  {#if error}
    <div class="notice bad">{error}</div>
  {/if}
</div>

{#if draft}
  <div class="card">
    <h2>{draft.sources.length > 1 ? 'Documents' : 'Document'}</h2>
    <div class="rows">
      {#each draft.sources as s}
        <div class="row">
          <span>{s.fileName}</span>
          <span class="value">
            {formatBytes(s.bytes.length)} ·
            <span class="mono">{groupHex(toHex(s.digest))}</span>
          </span>
        </div>
      {/each}
      {#if draft.underlying}
        <div class="row">
          <span>Notarized document</span>
          <span class="value mono">{groupHex(toHex(draft.underlying.digest))}</span>
        </div>
      {/if}
    </div>

    {#if draft.agreement.kind === 'differs'}
      <div class="notice bad">
        <strong>These are not signatures over the same document.</strong>
        {draft.agreement.detail} Listing them together would say they signed the same thing, so no
        certificate can be created from this set.
      </div>
    {:else if draft.agreement.kind === 'agree'}
      <div class="notice ok">
        All {draft.sources.length} files are signatures over the same document, established from
        {draft.agreement.evidence === 'notarized-digest'
          ? 'the OpenTimestamps proof each one carries'
          : 'the bytes preceding the first signature, which are identical'}.
      </div>
    {/if}
    {#if draft.underlying}
      <div class="notice ok">
        This is an xNotary Certificate 1. The digest above is the document it was issued for, read
        from the OpenTimestamps proof still embedded inside it.
      </div>
    {/if}
    {#if draft.errors.length > 0}
      <div class="notice bad">
        {draft.errors.length} signature{draft.errors.length === 1 ? '' : 's'} could not be read and
        cannot appear on the certificate:
        <ul>
          {#each draft.errors as e}<li>{e}</li>{/each}
        </ul>
      </div>
    {/if}
  </div>

  <div class="card">
    <h2>Who may be named?</h2>
    <p class="hint">
      Each signature below stays off the certificate until you tick it. Only the name, the issuing
      authority and the signing time are ever printed — nothing else from the certificate.
    </p>

    <div class="signers">
      {#each draft.signers as s, i}
        <label class="signer" class:on={consented[i]}>
          <input type="checkbox" bind:checked={consented[i]} />
          <div class="who">
            <strong>{s.name}</strong>
            <span class="meta">
              {#if s.selfSigned}
                <span class="warn-text">Self-signed — no authority vouched for this name</span>
              {:else}
                Certified by {s.qtsp}
              {/if}
            </span>
            <span class="meta">{timeText(s)}</span>
            <span class="meta">
              {#if s.documentIntegrity}
                Signed content intact
              {:else}
                <span class="bad-text">Signed content does not match — does not verify</span>
              {/if}
              {#if s.revision}· covers revision {s.revision.index} of {s.revision.of}{/if}
            </span>
            {#each s.warnings as w}<span class="meta">{w}</span>{/each}
          </div>
        </label>
      {/each}
    </div>

    <div class="notice">
      xNotary does not decide whether these are qualified electronic signatures — that needs the EU
      Trusted Lists. The certificate prints what each signing certificate claims and points to the
      <a href={VALIDATOR_URL} target="_blank" rel="noopener noreferrer">official EU validator</a>
      for the determination.
    </div>

    {#if withheld > 0}
      <div class="notice warn">
        {withheld} signature{withheld === 1 ? '' : 's'} will not be named. The certificate will still
        say {withheld === 1 ? 'one exists' : `${withheld} exist`}, without identifying
        {withheld === 1 ? 'them' : 'any of them'} — the signed document is attached in full either way.
      </div>
    {/if}

    <div class="actions">
      <button
        class="primary"
        disabled={busy || draft.agreement.kind === 'differs'}
        onclick={create}
      >
        {#if busy}<span class="spinner"></span>{/if}
        Create Certificate 2
      </button>
      <button onclick={reset}>Start over</button>
    </div>
    <p class="hint">
      You can create this at any time, with whichever signatures exist so far. There is no
      "complete" state and nothing expires — collect another signature later and issue a new one.
    </p>
  </div>
{/if}

{#if built}
  <div class="card">
    <h2><span class="badge ok">Certificate 2 created</span></h2>
    <p class="hint">
      One A4 page naming {chosen} signator{chosen === 1 ? 'y' : 'ies'}, with the signed document
      attached inside it, byte for byte. The attachment is what a validator needs — this certificate
      never altered it.
    </p>
    <div class="actions">
      <button
        class="primary"
        onclick={() =>
          downloadBytes(
            built!,
            `${draft?.sources[0]?.fileName ?? 'document'} — Certificate 2.pdf`,
            'application/pdf',
          )}
        >Save Certificate 2 (PDF)</button
      >
    </div>
  </div>
{/if}

<style>
  .signers {
    display: grid;
    gap: 0.6rem;
    margin-top: 0.9rem;
  }
  .signer {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--rule, #e2e5ea);
    border-radius: 8px;
    cursor: pointer;
  }
  .signer.on {
    border-color: #2563eb;
    background: rgba(37, 99, 235, 0.04);
  }
  .signer input {
    margin-top: 0.2rem;
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .meta {
    color: var(--muted);
    font-size: 0.82rem;
  }
  .warn-text {
    color: #b45309;
    font-weight: 600;
  }
  .bad-text {
    color: #b91c1c;
    font-weight: 600;
  }
</style>
