<script lang="ts">
  /**
   * Reading a PDF back: what does it claim, and does the claim hold?
   *
   * The counterpart to the timestamp on the signing screen, and it exists
   * because an app that can make a thing nobody can check has not really made
   * anything. It works on any PDF, not only the ones this app produced.
   *
   * The screen is careful about the difference between what it checked and what
   * it did not. It can say the file has not changed and the token is sound; it
   * cannot say the authority deserves to be believed, and it does not imply it.
   */
  import Info from '../../../../app/src/site/Info.svelte';
  import SignatureLevel from '../../../../app/src/site/SignatureLevel.svelte';
  import { checkSignatures, type CheckedSignature } from '../lib/document/verify/verify';
  import {
    checkLinks,
    orderChain,
    readCertificates,
    type ChainLink,
  } from '../lib/document/certificate/read/chain';

  let fileName = $state('');
  let fileSize = $state(0);
  let checking = $state(false);
  let checked = $state<CheckedSignature[] | null>(null);
  let error = $state('');
  let over = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  async function take(file: File | undefined) {
    if (!file) return;
    fileName = file.name;
    checked = null;
    error = '';
    checking = true;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      fileSize = bytes.length;
      if (!looksLikePdf(bytes)) {
        error = 'This is not a PDF. Only a PDF can carry a timestamp of this kind.';
        return;
      }
      checked = await checkSignatures(bytes);
    } catch {
      error = 'This file could not be read. It may be damaged, or only partly downloaded.';
    } finally {
      checking = false;
    }
  }

  function looksLikePdf(bytes: Uint8Array): boolean {
    return [0x25, 0x50, 0x44, 0x46, 0x2d].every((byte, index) => bytes[index] === byte);
  }

  function clear() {
    checked = null;
    error = '';
    fileName = '';
    supplied = {};
    if (fileInput) fileInput.value = '';
  }

  /**
   * Issuer certificates the reader went and fetched, per signature.
   *
   * A signature that encloses only the signer's own certificate is not a dead
   * end — the certificate names its issuer and usually says where that one is
   * published, and a reader who follows that address has the missing piece. It
   * cannot be followed from here: those addresses are plain http, which a page
   * served over https may not fetch, and they answer no CORS preflight either.
   * Both are the browser's rules, not this app's policy, and no opt-in lifts
   * them.
   *
   * So the reader fetches it and drops it in, and the arithmetic happens here,
   * offline, exactly as it does on the signing screen. Keyed by signature
   * because a document may carry several, each wanting a different issuer.
   */
  let supplied = $state<Record<number, { name: string; links: ChainLink[]; error: string }>>({});

  async function takeIssuers(index: number, result: CheckedSignature, file: File | undefined) {
    if (!file) return;

    const leaf = result.certificate;
    if (!leaf) {
      supplied[index] = {
        name: file.name,
        links: [],
        error: 'This signature carries no readable certificate to continue from.',
      };
      return;
    }

    const found = readCertificates(new Uint8Array(await file.arrayBuffer()));
    if (found.length === 0) {
      supplied[index] = {
        name: file.name,
        links: [],
        error:
          'No certificate could be read from that file. The .crt an authority publishes, or a ' +
          '.pem bundle, will work.',
      };
      return;
    }

    const ordered = orderChain(leaf, found);
    if (ordered.length === 0) {
      supplied[index] = {
        name: file.name,
        links: [],
        error:
          'None of the certificates in that file signed this one, so they do not continue this ' +
          'chain. It may be for a different authority.',
      };
      return;
    }

    supplied[index] = { name: file.name, links: await checkLinks(leaf, ordered), error: '' };
  }

  /** UTC, spelled out. A timestamp in local time invites reading it as local. */
  function when(time: Date): string {
    return `${time.toISOString().replace('T', ' ').replace('.000Z', '')} UTC`;
  }
</script>

<section class="product-view">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>Check a PDF</h1>
      </div>
      <span class="secure-note"
        >Processed in this browser<Info
          >Nothing is uploaded and nothing is fetched — the whole check runs on this device, on the
          file's own bytes.</Info
        ></span
      >
    </div>

    <div class="flow-shell">
      <div class="flow-main">
        <div class="flow-panel">
          <h2 class="panel-title">
            Open a PDF<Info
              >Any PDF, not only one made here. Checked: that it still matches each timestamp and
              signature byte for byte, that each token holds against its certificate, and whether
              anything was appended afterwards.</Info
            >
          </h2>

          {#if fileName && !error}
            <div class="picked">
              <div class="picked-name">{fileName}</div>
              <div class="picked-facts">
                {#if checking}
                  Checking…
                {:else if checked}
                  {checked.length === 0
                    ? 'No timestamp or signature found'
                    : `${checked.length} found`}
                {/if}
              </div>
            </div>
            <div class="action-group">
              <button class="button secondary small" type="button" onclick={clear}>
                Check a different file
              </button>
            </div>
          {:else}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <label
              class="dropzone"
              class:over
              ondragover={(event) => {
                event.preventDefault();
                over = true;
              }}
              ondragleave={() => (over = false)}
              ondrop={(event) => {
                event.preventDefault();
                over = false;
                void take(event.dataTransfer?.files?.[0]);
              }}
            >
              <div>
                <div class="file-icon" aria-hidden="true">PDF</div>
                <strong>Drop a PDF here</strong>
                <div class="drop-hint">or click to choose one</div>
              </div>
              <input
                bind:this={fileInput}
                type="file"
                accept=".pdf"
                onchange={(event) => void take(event.currentTarget.files?.[0])}
              />
            </label>
          {/if}

          {#if error}
            <div class="notice bad"><strong>Cannot check this one.</strong> {error}</div>
            <div class="action-group">
              <button class="button secondary small" type="button" onclick={clear}>
                Try another file
              </button>
            </div>
          {/if}
        </div>

        {#if checked && checked.length === 0 && !error}
          <div class="flow-panel">
            <h2 class="panel-title">Nothing to check</h2>
            <p class="panel-copy">
              No timestamp and no digital signature — most PDFs have neither.<Info
                >So nothing in the file says when it existed. A picture of a signature on a page
                cannot be checked: it leaves no trace of who put it there.</Info
              >
            </p>
          </div>
        {/if}

        {#each checked ?? [] as result, index}
          <div class="flow-panel">
            <h2 class="panel-title">
              {result.isTimestamp ? 'Timestamp' : 'Signature'}{(checked?.length ?? 0) > 1
                ? ` ${index + 1}`
                : ''}
            </h2>

            {#if result.verdict === 'intact'}
              <div class="notice ok">
                <strong>
                  The document has not changed since it was {result.isTimestamp
                    ? 'stamped'
                    : 'signed'}.
                </strong>
</div>
            {:else if result.verdict === 'altered'}
              <div class="notice bad">
                <strong>This document has been changed.</strong>
                {result.detail}
              </div>
            {:else if result.verdict === 'broken'}
              <div class="notice bad"><strong>The token does not hold up.</strong> {result.detail}</div>
            {:else}
              <div class="notice warn">
                <strong>Could not read it.</strong>
                {result.detail}
              </div>
            {/if}

            <div class="facts">
              {#if result.time}
                <div>
                  <span>{result.isTimestamp ? 'Stated time' : "Signer's own clock"}</span>
                  <strong>{when(result.time)}</strong>
                </div>
              {/if}
              {#if result.reason}
                <div><span>Reason</span><strong>{result.reason}</strong></div>
              {/if}
              {#if result.location}
                <div><span>Location</span><strong>{result.location}</strong></div>
              {/if}
              {#if result.signedBy}
                <div><span>Signed by</span><strong>{result.signedBy}</strong></div>
              {/if}
              {#if result.policy}
                <div><span>Policy</span><code>{result.policy}</code></div>
              {/if}
              {#if result.timestamp}
                <div>
                  <span>Timestamped</span>
                  <strong>
                    {when(result.timestamp.time)}{result.timestamp.signedBy
                      ? ` by ${result.timestamp.signedBy}`
                      : ''}
                  </strong>
                </div>
              {/if}
              <div>
                <span>Covers</span>
                <strong>
                  {#if result.coversToEndOfFile}
                    <!--
                      The raw figure is smaller than the file and reads as though
                      the timestamp only reached part of it. What it does not
                      include is the token's own bytes, which cannot sign
                      themselves.
                    -->
                    the whole document, apart from its own {(
                      fileSize - result.covers
                    ).toLocaleString()} bytes
                  {:else}
                    {result.covers.toLocaleString()} of {fileSize.toLocaleString()} bytes — not to the
                    end of the file
                  {/if}
                </strong>
              </div>
            </div>

            {#if !result.isTimestamp && result.certificateCount > 0}
              <!--
                Whether the signature brought the certificates a reader needs to
                trace it. This is the half the recipient cares about, and the
                half a leaf-only key file leaves out.
              -->
              {#if result.chain.length > 0}
                <div class="notice ok">
                  <strong>It carries the certificates above it.</strong>
                  <span class="outgoing-list">
                    {#each result.chain as link}
                      <span>
                        {link.holds ? '✓' : '✗'}
                        <strong>{link.subject}</strong> signed by <strong>{link.issuer}</strong>
                        {link.holds ? '' : ' — but that signature does not hold'}
                      </span>
                    {/each}
                  </span>
                  Each checked against the next — arithmetic only.
                </div>
              {:else}
                <!--
                  Amber until the reader has continued the chain below, then
                  plain. What it says stays true either way — the *document*
                  still encloses nothing — but leaving a warning above a green
                  result reads as unresolved when it is not.
                -->
                <div class="notice" class:warn={!supplied[index]?.links.length}>
                  <strong>This signature carries no issuer certificates.</strong>
                  Only the signer's own. The certificate names its issuer —
                  <strong>{result.issuedBy ?? 'not by any name it gives'}</strong> —
                  {#if result.claims?.issuerUrl}
                    and says where that one is published:
                    <span class="outgoing-list">
                      <span>
                        <strong>Published at:</strong>
                        <!--
                          A link, not a fetch. Following it is the reader
                          navigating their own browser; the app makes no request
                          either way, and could not if it wanted to — these
                          addresses are plain http, which a page served over
                          https may not load, and they answer no CORS preflight.
                        -->
                        <a href={result.claims.issuerUrl} target="_blank" rel="noopener noreferrer">
                          {result.claims.issuerUrl}
                        </a>
                      </span>
                    </span>
                    Most readers hold a well-known authority already, and an online one fetches it
                    from that address by itself — which is why this often validates elsewhere
                    without complaint. This app does not fetch it.
                    {#if supplied[index]?.links.length}
                      <strong>Continued below.</strong>
                    {:else}
                      Open it yourself and drop it in below.
                    {/if}
                  {:else}
                    and gives no address to fetch it from, so a reader that does not already hold
                    it has nowhere to look but its own store.
                    {#if supplied[index]?.links.length}
                      <strong>Continued below.</strong>
                    {/if}
                  {/if}
                </div>

                <!--
                  The same upload the signing screen offers, on the screen where
                  somebody is reading a document rather than making one. It
                  answers the question the notice above raises and otherwise
                  leaves hanging: fine, so is this chain sound or not?
                -->
                <div class="field">
                  <span class="field-label">Continue the chain yourself</span>
                  <p class="field-note">
                    Fetch the certificate above and drop it in. Checked offline; nothing is sent or
                    written back.
                  </p>
                  <input
                    class="input"
                    type="file"
                    accept=".pem,.crt,.cer,.der,.p7b,.p7c,application/x-x509-ca-cert,application/x-pkcs7-certificates"
                    onchange={(event) =>
                      void takeIssuers(index, result, event.currentTarget.files?.[0] ?? undefined)}
                  />
                </div>

                {#if supplied[index]?.error}
                  <div class="notice bad">{supplied[index].error}</div>
                {:else if supplied[index]?.links.length}
                  <div class="notice ok">
                    <strong>{supplied[index].name} continues this chain.</strong>
                    <span class="outgoing-list">
                      {#each supplied[index].links as link}
                        <span>
                          {link.holds ? '✓' : '✗'}
                          <strong>{link.subject}</strong> signed by <strong>{link.issuer}</strong>
                          {link.holds ? '' : ' — but that signature does not hold'}
                        </span>
                      {/each}
                    </span>
                    Checked link by link, which is arithmetic and all that is checked. Nothing
                    was written back: the file still carries only the signer's certificate, so the
                    next reader will have to do this too. Whether
                    {supplied[index].links[supplied[index].links.length - 1]?.issuer ??
                      'the authority at the top'} deserves belief is still not this app's call.
                  </div>
                {/if}
              {/if}
            {/if}

            {#if result.claims && !result.isTimestamp}
              <!--
                The level, from the certificate's own statements, kept apart from the app's
                findings: "this certificate says it is qualified" is a fact about the file; "this
                signature is qualified" is a judgement this app is not entitled to make.
              -->
              <SignatureLevel qualified={result.claims.qualified} onQualifiedDevice={result.claims.onQualifiedDevice}>
                {#if result.claims.purpose === 'seal'}Issued to an organisation, as a seal.{/if}
                {#if result.claims.purpose === 'website'}
                  It is a website certificate, which is not meant for signing documents.
                {/if}
                {#if result.claims.limit}
                  It declares a transaction limit of {result.claims.limit.value.toLocaleString()}
                  {result.claims.limit.currency}.
                {/if}
              </SignatureLevel>

              {#if result.claims.keyUsage.stated && !result.claims.keyUsage.digitalSignature && !result.claims.keyUsage.nonRepudiation}
                <div class="notice warn">
                  <strong>This certificate was not issued for signing.</strong>
                  Readers that enforce key usage will reject it.<Info
                    >Its key usage permits neither digital signature nor non-repudiation. The
                    signature is still sound arithmetic.</Info
                  >
                </div>
              {/if}
            {/if}

            {#if result.timestamp && !result.timestamp.coversSignature}
              <!--
                A token attached to a signature it does not describe would read
                as corroboration and be none, which is worth saying loudly.
              -->
              <div class="notice bad">
                <strong>The timestamp inside this signature is not for this signature.</strong>
                It attests to some other signature. Treat the time above as meaning nothing.
              </div>
            {:else if result.timestamp}
              <div class="notice ok">
                <strong>The time on this signature is not the signer's own.</strong>
                {result.timestamp.signedBy ?? 'An authority'} dated it.<Info
                  >So the time does not rest on the signer's computer. Whether that authority is
                  worth believing is, like the signer's identity, your PDF reader's call.</Info
                >
              </div>
            {/if}

            {#if !result.coversToEndOfFile}
              {@const next = (checked ?? [])[index + 1]}
              {#if next && next.covers > result.covers}
                <!--
                  When what came afterwards is itself a signature covering this
                  one, the file says what was added and there is no need to
                  leave the reader guessing.
                -->
                <div class="notice">
                  <strong>
                    What was added after this is the
                    {next.isTimestamp ? 'timestamp' : 'signature'} below{next.signedBy
                      ? `, by ${next.signedBy}`
                      : ''}.
                  </strong>
                  Normal for a document signed by more than one party.<Info
                    >Each signature covers everything before it, and the last one covers the whole
                    file. Nothing was changed behind anyone's back.</Info
                  >
                </div>
              {:else}
                <div class="notice warn">
                  <strong>
                    Something was added after this was {result.isTimestamp ? 'stamped' : 'signed'},
                    and it is not another signature.
                  </strong>
                  Part of what you see on opening it is covered by nothing above — find out what was
                  added.<Info
                    >That is how a document is made to show one thing while being signed as
                    another.</Info
                  >
                </div>
              {/if}
            {/if}

            <!--
              The limit of the check, next to the check rather than in a footnote.
              Saying "verified" without this would be the dishonest version.
            -->
            <div class="notice">
              <strong>Not checked:</strong> whether <em>{result.signedBy ?? 'that signer'}</em> is who
              they say they are — open the file in a PDF reader for that.<Info
                >That takes a list of trusted authorities, which this app chooses not to ship, and a
                revocation check, which needs a network it does not use. The name above is read out
                of the token, not vouched for.{#if !result.isTimestamp}
                  Reason and Location were typed by whoever signed; nothing makes them true.{/if}
                <!--
                  Named, not called: a refusal is easier to weigh against the addresses it
                  applies to than in the abstract. In the bubble, so the screen stays short.
                -->
                {#if result.claims?.ocspUrl || result.claims?.crlUrls.length}
                  Where that check would go, uncalled:
                  <span class="outgoing-list">
                    {#if result.claims.ocspUrl}
                      <span><strong>Asked at:</strong> <code>{result.claims.ocspUrl}</code></span>
                    {/if}
                    {#each result.claims.crlUrls as url}
                      <span><strong>Listed at:</strong> <code>{url}</code></span>
                    {/each}
                  </span>
                {/if}</Info
              >

            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>
