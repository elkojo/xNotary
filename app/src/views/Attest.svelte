<script lang="ts">
  import Stepper from '../site/Stepper.svelte';
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
  import { downloadBytes } from '../lib/download';
  import { formatBytes } from '../site/size';
  import { groupHex, toHex } from '../lib/hash';
  import { checkStatus, parseOts, type OtsStatus } from '../lib/ots';
  import { utcStamp } from '../lib/time';
  import Info from '../site/Info.svelte';
  import SignatureLevel from '../site/SignatureLevel.svelte';
  import {
    AgreementError,
    DSS_SOURCE_URL,
    analyzeSignedDocuments,
    buildCertificate2,
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
        <h1>Certify signers</h1>
      </div>
      <span class="secure-note"
        >Read in this browser<Info more="#/help/keeps"
          >The signed files are read on this device. Nothing is uploaded.</Info
        ></span
      >
    </div>

    <div class="flow-shell">
      <div class="flow-main">
        <Stepper steps={['Signed files', 'Who may be named', 'Certificate']} current={step} />

        {#if step === 1}
          <div class="flow-panel">
            <h2 class="panel-title">
              Add the signed files<Info more="#/help/signing"
                >Everyone signs in their own tool, with a provider they already trust. xNotary sends
                no invitations and never holds a signing key.</Info
              >
            </h2>

            <FileDrop
              icon="PDF"
              label="Drop the signed PDFs here"
              hint="one file signed by everyone, or one copy per signer"
              accept=".pdf"
              multiple
              {files}
              onselect={(f) => inspect([f])}
              onselectmany={(f) => inspect(f)}
            />

            <div style="margin-top:14px">
              <FileDrop
                compact
                icon="PDF"
                label="Drop the timestamp proof here (optional)"
                hint="its Certificate 1 or proof.ots"
                accept=".pdf,.ots"
                files={proofFile ? [proofFile] : []}
                onselect={(f) => inspect(files, f)}
              />
            </div>



            {#if busy}
              <div class="notice" role="status"><span class="spinner"></span> Reading signatures…</div>
            {/if}

            {#if error}
              <div class="notice bad" role="alert">{error}</div>
            {/if}

            <p class="field-help asks">
              <span
                >Sign the document or its Certificate 1?<Info more="#/help/what-to-sign"
                  >Prefer the document itself, then add its Certificate 1 or
                  <span class="mono">proof.ots</span> here: Certificate 2 then says the signatures are
                  over the document. Signing the Certificate 1 works too, but attests to the
                  certificate rather than the document.</Info
                ></span
              >
              <span
                >Parallel or in sequence?<Info more="#/help/parallel"
                  >In parallel, drop every signer's copy together; in sequence, drop the one file
                  that carries every signature. Copies that are not signatures over the same
                  document are never combined.</Info
                ></span
              >
            </p>
          </div>
        {:else if step === 2 && draft}
          <div class="flow-panel">
            <h2 class="panel-title">
              Who may be named?<Info
                >Nobody is named until you tick them. Only the name, the issuing authority and the
                signing time are printed.</Info
              >
            </h2>

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
              <div class="notice bad" role="alert">
                <strong>These are not signatures over the same document.</strong>
                {draft.agreement.detail} They cannot share a certificate.
              </div>
            {:else if draft.agreement.kind === 'agree'}
              <div class="notice ok">
                All {draft.sources.length} files are signatures over the same document.<Info
                  >Established from {draft.agreement.evidence === 'notarized-digest'
                    ? 'the OpenTimestamps proof each one carries'
                    : 'the bytes preceding the first signature, which are identical'}.</Info
                >
              </div>
            {/if}

            {#if draft.underlying}
              <div class="notice ok">
                An xNotary Certificate 1: the digest above is the document it was issued for.<Info
                  >Read from the OpenTimestamps proof still embedded inside it.</Info
                >
              </div>
            {/if}

            {#if draft.timestamp}
              {@const linked = draft.timestamp.links.filter(Boolean).length}
              {#if linked > 0}
                <div class="notice ok">
                  <strong>The signatures are over the document itself.</strong>
                  {#if linked < draft.timestamp.links.length}
                    The proof fits {linked} of {draft.timestamp.links.length} files.
                  {/if}
                  {statusText(proofStatus)}<Info
                    >The proof timestamps the bytes signed here, so the document existed in this
                    exact form before anyone signed it. It is attached to Certificate 2.</Info
                  >
                </div>
              {:else}
                <div class="notice warn">
                  <strong>That proof does not fit these files</strong>, so Certificate 2 will not link
                  them.<Info
                    >It commits to <span class="mono">{groupHex(toHex(draft.timestamp.digest))}</span>,
                    which is no revision of what was signed: it timestamps another document, or the
                    signing tool rewrote the file instead of appending to it.</Info
                  >
                </div>
              {/if}
            {/if}

            {#if draft.errors.length > 0}
              <div class="notice bad" role="alert">
                {draft.errors.length} signature{draft.errors.length === 1 ? '' : 's'} could not be read
                and cannot appear on the certificate:
                <ul>
                  {#each draft.errors as e}<li>{e}</li>{/each}
                </ul>
              </div>
            {/if}

            <!--
              Shown whether or not anything is unticked. Unticking a box is the
              moment the misunderstanding is formed, so the correction has to be
              on screen before it, not conditionally after it.
            -->
            <div class="notice" style="margin-top:18px">
              <strong>Leaving someone off is not anonymization.</strong> Their name stays inside the
              signed file the certificate attaches.<Info more="#/help/naming"
                >Unticking keeps a name off the overview page, which only says how many others
                signed. Anyone opening the attachment can read the name, and removing it would break
                the signature.</Info
              >
            </div>

            <div class="signers" style="margin-top:14px">
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
                    <SignatureLevel compact qualified={s.qualifiedClaim.qcCompliance} onQualifiedDevice={s.qualifiedClaim.qcSSCD} />
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
                    {#if !consented[i]}
                      <span class="meta warn-text"
                        >Not named on the certificate — still named inside the attached file</span
                      >
                    {/if}
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
              <strong>Claims, not verdicts.</strong> Nothing here is checked against a trust list.<Info
                more="#/help/validation"
                >So xNotary cannot tell you a signature meets its framework's highest tier — a QES, in
                the EU. Validate the signed document against the trust list it was issued under: run
                <a href={DSS_SOURCE_URL} target="_blank" rel="noopener noreferrer">DSS</a> on your own
                machine, or ask a trust provider.</Info
              >
            </div>


            {#if error}
              <div class="notice bad" role="alert">{error}</div>
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
            <p class="field-help">More signatures later? Issue a new certificate any time.</p>
          </div>
        {:else if step === 3 && built && draft}
          <div class="flow-panel">
            <div class="success">
              <div class="success-mark" aria-hidden="true">✓</div>
              <h2>Certificate 2 created</h2>
              <p>
                Names {chosen} signator{chosen === 1 ? 'y' : 'ies'}; the signed
                document{draft.sources.length > 1 ? 's are' : ' is'} attached unchanged.
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
              {#if saved}
                <strong>Saved.</strong> Keep it somewhere you back up — it is the only copy.
              {:else}
                <strong>Save it now</strong> — it exists only in this tab.<Info
                  >Nothing is stored, here or anywhere. If it is lost, it rebuilds identically from
                  the same signed {draft.sources.length > 1 ? 'files' : 'file'}.</Info
                >
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
    </div>
  </div>
</section>
