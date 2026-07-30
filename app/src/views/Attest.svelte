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
  import { checkStatus, parseOts, type OtsStatus } from '../lib/ots';
  import { utcStamp } from '../lib/time';
  import {
    AgreementError,
    DSS_SOURCE_URL,
    analyzeSignedDocuments,
    buildCertificate2,
    claimsLine,
    type Certificate2Draft,
  } from '../lib/certificate2';

  let files = $state<File[]>([]);
  /** The Certificate 1 or bare .ots for the document that was signed. */
  let proofFile = $state<File | null>(null);
  let draft = $state<Certificate2Draft | null>(null);
  let proofStatus = $state<OtsStatus | null>(null);
  let consented = $state<boolean[]>([]);
  let busy = $state(false);
  let error = $state('');
  let built = $state<Uint8Array | null>(null);
  /** Flips once the user has actually downloaded, so the warning can stand down. */
  let saved = $state(false);

  const chosen = $derived(consented.filter(Boolean).length);
  const withheld = $derived((draft?.signers.length ?? 0) - chosen);

  async function inspect(picked: File[] = files, withProof: File | null = proofFile) {
    files = picked;
    proofFile = withProof;
    draft = null;
    built = null;
    saved = false;
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
        withProof
          ? { fileName: withProof.name, bytes: new Uint8Array(await withProof.arrayBuffer()) }
          : undefined,
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

      // The proof says which block it is anchored to; only an explorer can
      // confirm it. `checkStatus` degrades to `unverified` when offline, which
      // is the honest answer rather than a failure.
      proofStatus = null;
      if (result.timestamp) {
        try {
          proofStatus = await checkStatus(parseOts(result.timestamp.ots));
        } catch {
          /* nothing checked, so nothing claimed */
        }
      }
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
    saved = false;
    try {
      built = await buildCertificate2({
        sources: draft.sources.map((s) => ({ fileName: s.fileName, bytes: s.bytes })),
        signers: draft.signers.filter((_, i) => consented[i]),
        withheldCount: withheld,
        generatedAt: new Date(),
        underlying: draft.underlying ?? undefined,
        timestamp: draft.timestamp ? { ...draft.timestamp, status: proofStatus } : undefined,
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
    saved = false;
    files = [];
    proofFile = null;
    proofStatus = null;
    draft = null;
    built = null;
    error = '';
  }

  /** Only ever what was actually checked — see invariant 3. */
  function statusText(status: OtsStatus | null): string {
    if (!status) return 'The anchor itself was not checked from here.';
    switch (status.kind) {
      case 'confirmed':
        return `Anchored in Bitcoin block ${status.blockHeights.join(', ')} at ${utcStamp(status.blockTime)}.`;
      case 'pending':
        return 'The proof is accepted by a calendar but not yet in a Bitcoin block.';
      case 'unverified':
        return status.blockHeights.length > 0
          ? `Attested to Bitcoin block ${status.blockHeights.join(', ')}, not independently checked from here.`
          : 'The anchor could not be checked from here.';
    }
  }

  function timeText(s: Certificate2Draft['signers'][number]): string {
    if (!s.signedAt) return 'no signing time recorded';
    const when = utcStamp(s.signedAt);
    if (s.timeSource === 'claimed') return `${when} (signer's own claim)`;
    if (!s.timestampMatches) return `${when} — timestamp does not cover this signature`;
    return `${when} (timestamped)`;
  }
</script>

<div class="card">
  <h2>Create Certificate 2</h2>
  <p class="hint">
    Certificate 1 shows a document existed. Certificate 2 shows who put their name to it. Drop the
    signed PDFs and choose who may be named. Everything is read on this device; nothing is
    uploaded.
  </p>
  <p class="hint">
    <strong>You can sign the document itself.</strong> Have everyone sign the contract rather than
    the Certificate 1, then drop the signed contract here together with its Certificate 1 (or the
    <span class="mono">proof.ots</span>) below. xNotary checks that the timestamped bytes really
    are a revision of the file they signed, and Certificate 2 then says the signatures are over
    the document — carrying the proof along inside it. Signing the Certificate 1 still works;
    it just attests to the certificate rather than to the contract.
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

  <div style="margin-top:1rem">
    <FileDrop
      label="Timestamp proof (optional)"
      hint="The Certificate 1 for the signed document, or its proof.ots"
      accept=".pdf,.ots"
      onselect={(f) => inspect(files, f)}
    />
    {#if proofFile}
      <p class="hint">Proof: {proofFile.name}</p>
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
    {#if draft.timestamp}
      {@const linked = draft.timestamp.links.filter(Boolean).length}
      {#if linked > 0}
        <div class="notice ok">
          <strong>The signatures are over the document itself.</strong>
          {linked === draft.timestamp.links.length
            ? 'The proof you supplied timestamps'
            : `The proof you supplied timestamps ${linked} of ${draft.timestamp.links.length} of these files at`}
          the bytes signed here, so the document existed in this exact form before anyone signed
          it. {statusText(proofStatus)} The proof is attached to Certificate 2.
        </div>
      {:else}
        <div class="notice warn">
          <strong>That proof does not fit these files.</strong> It commits to
          <span class="mono">{groupHex(toHex(draft.timestamp.digest))}</span>, which is not any
          revision of what was signed — so it is a timestamp of some other document, or the signing
          tool rewrote the file rather than appending to it. Certificate 2 will not claim a link it
          could not establish.
        </div>
      {/if}
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
            <span class="meta">{claimsLine(s.qualifiedClaim)}</span>
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
      For the determination, validate the signed document against the trust list of the framework
      it was signed under — in the EU, the EU Trusted Lists. Two routes: run
      <a href={DSS_SOURCE_URL} target="_blank" rel="noopener noreferrer">DSS</a>, the EU's
      open-source reference implementation, on your own machine, so the document never leaves it;
      or ask a trust provider for a validation service. In the EU only a qualified provider may
      give a qualified validation, and only that result carries the presumption eIDAS attaches
      to it.
    </div>

    <div class="notice warn">
      xNotary reads these claims from the certificate. It does not check them against any trust
      list, so it cannot confirm that a signature is a QES — or whatever your own jurisdiction
      calls its highest tier — and a QES has the legal effect of a handwritten signature only when
      it is one. xNotary never uploads anything, so this step is yours to take.
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
      One A4 page naming {chosen} signator{chosen === 1 ? 'y' : 'ies'}, with the signed
      document{draft && draft.sources.length > 1 ? 's' : ''} attached inside it, byte for byte. The
      attachment is what a validator needs — this certificate never altered it.
    </p>

    <div class="notice warn">
      <strong>Save it now — xNotary is not keeping a copy.</strong>
      This certificate exists only in this browser tab. It is not stored on any server, because there
      is no server, and it is not written to this device either. Close the tab or navigate away and
      it is gone.
      {#if saved}
        <br /><br />Saved. Keep it somewhere you back up — it is your copy and the only one.
      {:else}
        <br /><br />Nothing is lost if you do: you can rebuild an identical certificate at any time
        from the same signed {draft && draft.sources.length > 1 ? 'files' : 'file'}, which is why
        xNotary sees no reason to hold one for you.
      {/if}
    </div>

    <div class="actions">
      <button
        class="primary"
        onclick={() => {
          downloadBytes(built!, draft!.suggestedFileName, 'application/pdf');
          saved = true;
        }}>Save Certificate 2 (PDF)</button
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
