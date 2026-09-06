<script lang="ts">
  /**
   * "Signatures" — Certificate 2, in three steps: bring the signed files,
   * choose who may be named, issue the certificate.
   *
   * The consent gate on step 2 is the point of this screen, not a formality.
   * Every box starts unticked: a signature in a document is not consent to be
   * listed in a new one. Withheld signatures are still disclosed as a count,
   * because a certificate that silently omitted them would misrepresent the
   * document.
   *
   * xNotary collects nothing and sends nothing. Signing happens in the signer's
   * own tool, with their own provider; this screen reads a file that has
   * already been signed.
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
  import type { View } from '../nav';

  interface Props {
    go: (view: View) => void;
  }
  let { go }: Props = $props();

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
  let step = $state(1);

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
      step = 2;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      step = 1;
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
      step = 3;
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
    step = 1;
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

<section class="product-view">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>Attest signatures</h1>
        <p>
          Certificate 1 shows a document existed. Certificate 2 shows who put their name to it —
          read from files that were signed elsewhere, with each signer's consent.
        </p>
      </div>
      <span class="secure-note">Read in this browser</span>
    </div>

    <div class="flow-shell">
      <div class="flow-main">
        <div class="stepper">
          <button class="step" class:active={step === 1} class:done={step > 1} disabled>
            1 Signed files
          </button>
          <button class="step" class:active={step === 2} class:done={step > 2} disabled>
            2 Who may be named
          </button>
          <button class="step" class:active={step === 3} disabled>3 Certificate</button>
        </div>

        {#if step === 1}
          <div class="flow-panel">
            <h2 class="panel-title">Bring the signed files</h2>
            <p class="panel-copy">
              xNotary does not send signing invitations and never holds a signing key. Everyone
              signs in their own tool, with a provider they already trust; you drop the result here.
            </p>

            <FileDrop
              label="Signed PDFs"
              hint="One file signed by everyone, or one copy per signer"
              accept=".pdf"
              multiple
              onselect={(f) => inspect([f])}
              onselectmany={(f) => inspect(f)}
            />
            {#if files.length > 0}
              <p class="field-help">
                {files.length} file{files.length === 1 ? '' : 's'}: {files
                  .map((f) => f.name)
                  .join(', ')}
              </p>
            {/if}

            <div style="margin-top:14px">
              <FileDrop
                compact
                icon="◇"
                label="Timestamp proof (optional)"
                hint="The Certificate 1 for the signed document, or its proof.ots"
                accept=".pdf,.ots"
                file={proofFile}
                onselect={(f) => inspect(files, f)}
              />
            </div>

            <div class="privacy">Everything is read on this device; nothing is uploaded.</div>

            {#if busy}
              <div class="notice"><span class="spinner"></span> Reading signatures…</div>
            {/if}

            {#if error}
              <div class="notice bad">{error}</div>
            {/if}

            <details class="explain">
              <summary>Sign the document itself, or its Certificate 1?</summary>
              <div>
                Have everyone sign the contract rather than the Certificate 1, then drop the signed
                contract here together with its Certificate 1 (or the
                <span class="mono">proof.ots</span>). xNotary checks that the timestamped bytes
                really are a revision of the file they signed, and Certificate 2 then says the
                signatures are over the document — carrying the proof along inside it. Signing the
                Certificate 1 still works; it just attests to the certificate rather than to the
                contract.
              </div>
            </details>

            <details class="explain">
              <summary>Signing in parallel or in sequence</summary>
              <div>
                In parallel, each signer gets their own copy to sign; drop all of them together and
                their signatures are pooled onto one certificate. In sequence, one file ends up
                carrying every signature — drop just that. Either way, xNotary first checks the
                files really are signatures over the same document, and refuses to combine them if
                they are not.
              </div>
            </details>
          </div>
        {:else if step === 2 && draft}
          <div class="flow-panel">
            <h2 class="panel-title">Who may be named?</h2>
            <p class="panel-copy">
              Each signature stays off the certificate until you tick it. Only the name, the issuing
              authority and the signing time are ever printed — nothing else from the certificate.
            </p>

            <div class="review-box">
              {#each draft.sources as s}
                <div class="review-row">
                  <span class="plain">{s.fileName}</span>
                  <strong>
                    {formatBytes(s.bytes.length)} ·
                    <span class="mono">{groupHex(toHex(s.digest))}</span>
                  </strong>
                </div>
              {/each}
              {#if draft.underlying}
                <div class="review-row">
                  <span>Notarized document</span>
                  <strong class="mono">{groupHex(toHex(draft.underlying.digest))}</strong>
                </div>
              {/if}
            </div>

            {#if draft.agreement.kind === 'differs'}
              <div class="notice bad">
                <strong>These are not signatures over the same document.</strong>
                {draft.agreement.detail} Listing them together would say they signed the same thing,
                so no certificate can be created from this set.
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
                This is an xNotary Certificate 1. The digest above is the document it was issued
                for, read from the OpenTimestamps proof still embedded inside it.
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
                  the bytes signed here, so the document existed in this exact form before anyone
                  signed it. {statusText(proofStatus)} The proof is attached to Certificate 2.
                </div>
              {:else}
                <div class="notice warn">
                  <strong>That proof does not fit these files.</strong> It commits to
                  <span class="mono">{groupHex(toHex(draft.timestamp.digest))}</span>, which is not
                  any revision of what was signed — so it is a timestamp of some other document, or
                  the signing tool rewrote the file rather than appending to it. Certificate 2 will
                  not claim a link it could not establish.
                </div>
              {/if}
            {/if}

            {#if draft.errors.length > 0}
              <div class="notice bad">
                {draft.errors.length} signature{draft.errors.length === 1 ? '' : 's'} could not be read
                and cannot appear on the certificate:
                <ul>
                  {#each draft.errors as e}<li>{e}</li>{/each}
                </ul>
              </div>
            {/if}

            <div class="signers" style="margin-top:18px">
              {#each draft.signers as s, i}
                <label class="signer" class:on={consented[i]}>
                  <input type="checkbox" bind:checked={consented[i]} />
                  <div class="who">
                    <strong>{s.name}</strong>
                    <span class="meta" class:warn-text={s.selfSigned}>
                      {#if s.selfSigned}
                        Self-signed — no authority vouched for this name
                      {:else}
                        Certified by {s.qtsp}
                      {/if}
                    </span>
                    <span class="meta">{claimsLine(s.qualifiedClaim)}</span>
                    <span class="meta">{timeText(s)}</span>
                    <span class="meta" class:bad-text={!s.documentIntegrity}>
                      {#if s.documentIntegrity}
                        Signed content intact
                      {:else}
                        Signed content does not match — does not verify
                      {/if}
                      {#if s.revision}· covers revision {s.revision.index} of {s.revision.of}{/if}
                    </span>
                    {#each s.warnings as w}<span class="meta">{w}</span>{/each}
                  </div>
                </label>
              {/each}
            </div>

            <!--
              One notice, not two. Both halves have to survive the merge: what
              xNotary does *not* do (invariant 5), and the trust list named as
              the framework's rather than as eIDAS's.
            -->
            <div class="notice warn">
              xNotary only reports what these certificates claim; it checks them against no trust
              list, so it cannot tell you a signature is a QES — or whatever your jurisdiction calls
              its highest tier. For that, validate the signed document against the trust list it was
              issued under: run
              <a href={DSS_SOURCE_URL} target="_blank" rel="noopener noreferrer">DSS</a> on your own
              machine, so the document never leaves it, or ask a trust provider. In the EU, only a
              qualified provider's validation carries the presumption eIDAS attaches.
            </div>

            {#if withheld > 0}
              <div class="notice warn">
                {withheld} signature{withheld === 1 ? '' : 's'} will not be named. The certificate will
                still say {withheld === 1 ? 'one exists' : `${withheld} exist`}, without identifying
                {withheld === 1 ? 'them' : 'any of them'} — the signed document is attached in full either
                way.
              </div>
            {/if}

            {#if error}
              <div class="notice bad">{error}</div>
            {/if}

            <div class="flow-actions">
              <button class="button ghost-dark" disabled={busy} onclick={() => (step = 1)}>
                ← Change files
              </button>
              <button
                class="button dark"
                disabled={busy || draft.agreement.kind === 'differs'}
                onclick={create}
              >
                {#if busy}<span class="spinner"></span>{/if}
                Create Certificate 2
              </button>
            </div>
            <p class="field-help">
              You can create this at any time, with whichever signatures exist so far. There is no
              “complete” state and nothing expires — collect another signature later and issue a new
              one.
            </p>
          </div>
        {:else if step === 3 && built && draft}
          <div class="flow-panel">
            <div class="success">
              <div class="success-mark" aria-hidden="true">✓</div>
              <h2>Certificate 2 created</h2>
              <p>
                One A4 page naming {chosen} signator{chosen === 1 ? 'y' : 'ies'}, with the signed
                document{draft.sources.length > 1 ? 's' : ''} attached inside it, byte for byte. The
                attachment is what a validator needs — this certificate never altered it.
              </p>

              <div class="success-actions">
                <button
                  class="button dark"
                  onclick={() => {
                    downloadBytes(built!, draft!.suggestedFileName, 'application/pdf');
                    saved = true;
                  }}>Save Certificate 2 (PDF)</button
                >
              </div>
            </div>

            <div class="notice warn">
              <strong>Save it now — xNotary is not keeping a copy.</strong>
              This certificate exists only in this browser tab: no server, and nothing written to
              this device. Close the tab and it is gone.
              {#if saved}
                Saved — keep it somewhere you back up, it is the only copy.
              {:else}
                Nothing is lost if you do: it rebuilds identically from the same signed
                {draft.sources.length > 1 ? 'files' : 'file'} at any time.
              {/if}
            </div>

            <div class="flow-actions">
              <button class="button ghost-dark" onclick={() => (step = 2)}>
                ← Change who is named
              </button>
              <button class="button ghost-dark" onclick={reset}>Start over</button>
            </div>
          </div>
        {/if}
      </div>

      <aside class="side-card">
        <h3>Before you name anyone</h3>
        <p>
          A signature in a document is not consent to be listed in a new one — nobody appears until
          you say so, and the ones you leave off are still counted.
        </p>
        <div class="side-list">
          <div>Signatures are read, never collected</div>
          <div>Your signing key never touches xNotary</div>
          <div>The signed file is attached, not modified</div>
          <div>Claims are reported; no legal verdict is given</div>
        </div>
        <p style="margin-top:17px">
          Not sure where a signature comes from?
          <button class="link-button" onclick={() => go('help')}>How it works</button> lists what counts
          in the EU, and what does not.
        </p>
      </aside>
    </div>
  </div>
</section>
