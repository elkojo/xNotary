<script lang="ts">
  /**
   * Reading a signed file back: what does it claim, and does the claim hold?
   *
   * The counterpart to the timestamp on the signing screen, and it exists
   * because an app that can make a thing nobody can check has not really made
   * anything. It works on any PDF or signature container, not only the ones this
   * app produced.
   *
   * The screen is careful about the difference between what it checked and what
   * it did not. It can say the file has not changed and the token is sound; it
   * cannot say the authority deserves to be believed, and it does not imply it.
   */
  import Info from '../../../../app/src/site/Info.svelte';
  import { formatBytes } from '../../../../app/src/site/size';
  import { downloadBlob } from '../lib/signature/download';
  import { checkContainer, checkUnpacked } from '../lib/document/verify/asic/container';
  import { readFolder } from '../lib/document/verify/asic/folder';
  import type { CheckedContainer, ContainerFile, ContainerSignature } from '../lib/document/verify/asic/types';
  import { ContainerRefused, looksLikeZip, printable, savedName } from '../lib/document/verify/asic/zip';
  import { checkSignatures, type CheckedSignature } from '../lib/document/verify/verify';
  import SignerChecks from './SignerChecks.svelte';

  let fileName = $state('');
  let fileSize = $state(0);
  let checking = $state(false);
  let checked = $state<CheckedSignature[] | null>(null);
  let opened = $state<CheckedContainer | null>(null);
  let error = $state('');
  let over = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  const found = $derived(checked?.length ?? opened?.signatures.length ?? null);

  async function take(file: File | undefined) {
    if (!file) return;
    fileName = file.name;
    checked = null;
    opened = null;
    error = '';
    checking = true;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      fileSize = bytes.length;
      // By content, not by name: real containers arrive called `.zip`.
      if (looksLikePdf(bytes)) {
        checked = await checkSignatures(bytes);
      } else if (looksLikeZip(bytes)) {
        opened = await checkContainer(bytes);
      } else {
        error = 'This is neither a PDF nor a signature container, so it cannot carry a signature of this kind.';
      }
    } catch (failure) {
      error =
        failure instanceof ContainerRefused
          ? failure.message
          : 'This file could not be read. It may be damaged, or only partly downloaded.';
    } finally {
      checking = false;
    }
  }

  /** What a file manager leaves when it unpacks a container, dropped rather than picked. */
  async function takeFolder(folder: FileSystemDirectoryEntry) {
    fileName = folder.name;
    checked = null;
    opened = null;
    error = '';
    checking = true;
    try {
      opened = await checkUnpacked(await readFolder(folder));
    } catch (failure) {
      error = failure instanceof ContainerRefused ? failure.message : 'This folder could not be read.';
    } finally {
      checking = false;
    }
  }

  /** A dropped item has to be asked what it is during the drop itself; the list empties after. */
  function takeDrop(transfer: DataTransfer | null) {
    const entry = transfer?.items?.[0]?.webkitGetAsEntry?.();
    if (entry?.isDirectory) void takeFolder(entry as FileSystemDirectoryEntry);
    else void take(transfer?.files?.[0]);
  }

  function looksLikePdf(bytes: Uint8Array): boolean {
    return [0x25, 0x50, 0x44, 0x46, 0x2d].every((byte, index) => bytes[index] === byte);
  }

  function clear() {
    checked = null;
    opened = null;
    error = '';
    fileName = '';
    if (fileInput) fileInput.value = '';
  }

  /** UTC, spelled out. A timestamp in local time invites reading it as local. */
  function when(time: Date): string {
    return `${time.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')} UTC`;
  }

  /** Never rendered, only saved: what a container holds is whatever somebody put there. */
  function save(file: ContainerFile) {
    downloadBlob(new Blob([file.bytes.slice()], { type: 'application/octet-stream' }), savedName(file.name));
  }

  const signatureTitle = (signature: ContainerSignature): string =>
    signature.form === 'timestamp' ? 'Timestamp' : 'Signature';

  /** "Signature 2", when there is more than one to tell apart. */
  const titleOf = (index: number): string => {
    const signature = opened!.signatures[index];
    if (signature.counters !== null) return `Counter-signature on ${titleOf(signature.counters)}`;
    const top = opened!.signatures.filter((other) => other.counters === null);
    return top.length > 1 ? `${signatureTitle(signature)} ${top.indexOf(signature) + 1}` : signatureTitle(signature);
  };

  const coveredByText = (file: ContainerFile): string =>
    file.coveredBy.length === 0 ? 'Not covered by any signature that holds' : `Covered by ${file.coveredBy.map(titleOf).join(', ')}`;

  const uncovered = $derived(opened?.files.filter((file) => file.coveredBy.length === 0).length ?? 0);
  const containerJudge = 'a validator that holds the trust lists';
</script>

<section class="product-view">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>Check a signed file</h1>
      </div>
      <span class="secure-note"
        >Processed in this browser<Info
          >Nothing is uploaded — the whole check runs on this device, on the file's own bytes. All it
          fetches is from this site: its copy of the trusted lists and of a revocation list, for the
          certificate's issuer. Nothing about you or the file is sent.</Info
        ></span
      >
    </div>

    <div class="flow-shell">
      <div class="flow-main">
        <div class="flow-panel">
          <h2 class="panel-title">
            Open a signed file<Info
              >Any PDF or signature container (.asice, .asics, .bdoc, sometimes .zip), or a container's
              unpacked folder dropped here, not only one made here. Checked: that it still matches each timestamp and signature byte for byte, that
              each token holds against its certificate, and whether anything was added afterwards.</Info
            >
          </h2>

          {#if fileName && !error}
            <div class="picked">
              <div class="picked-name" translate="no">{fileName}</div>
              <div class="picked-facts">
                {#if checking}
                  Checking…
                {:else if found !== null}
                  {found === 0 ? 'No timestamp or signature found' : `${found} found`}
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
                takeDrop(event.dataTransfer);
              }}
            >
              <div>
                <div class="file-icon" aria-hidden="true">FILE</div>
                <strong>Drop a PDF or a signature container here</strong>
                <div class="drop-hint">or click to choose one</div>
              </div>
              <input
                bind:this={fileInput}
                type="file"
                accept=".pdf,.asice,.sce,.asics,.scs,.bdoc,.edoc,.adoc,.zip"
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

        {#if found === 0 && !error}
          <div class="flow-panel">
            <h2 class="panel-title">Nothing to check</h2>
            <p class="panel-copy">
              {#if opened}
                This container holds no signature and no timestamp.<Info
                  >So nothing in it says who signed these files or when they existed.</Info
                >
              {:else}
                No timestamp and no digital signature — most PDFs have neither.<Info
                  >So nothing in the file says when it existed. A picture of a signature on a page
                  cannot be checked: it leaves no trace of who put it there.</Info
                >
              {/if}
            </p>
          </div>
        {/if}

        {#if opened}
          <div class="flow-panel">
            <h2 class="panel-title">
              In this container<Info
                >Saved exactly as they are inside it, and never opened here. A file no signature covers
                could have been added by anyone.</Info
              >
            </h2>

            <div class="facts">
              {#each opened.files as file}
                <div class="container-file">
                  <span class="container-file-name" translate="no">{printable(file.name)}</span>
                  <span class="container-file-facts">
                    {formatBytes(file.bytes.length)} · {coveredByText(file)}
                  </span>
                  <button class="button secondary small" type="button" onclick={() => save(file)}>Save</button>
                </div>
              {/each}
            </div>

            {#if uncovered > 0 && opened.signatures.length > 0}
              <div class="notice warn">
                <strong>
                  {uncovered === 1 ? 'One file here is' : `${uncovered} files here are`} covered by no signature that holds.
                </strong>
                Treat {uncovered === 1 ? 'it' : 'them'} as unsigned.
              </div>
            {/if}

            {#if opened.unusualMediaType}
              <div class="notice warn">
                <strong>This container describes itself as something else.</strong>
                It says it is <code translate="no">{printable(opened.mediaType ?? '')}</code>. Its signatures were read
                anyway.
              </div>
            {/if}

            {#if opened.fromFolder}
              <div class="notice">
                <strong>Checked from an unpacked folder.</strong> The signatures read the same, but anything
                only the container itself could show cannot be checked here.<Info
                  >A container is a ZIP. Some problems exist only at that level, such as one name listed twice so
                  that different programs open different files. A folder has no way to carry them, and no way to
                  show they were never there. Anything your system added to the folder also appears above.</Info
                >
              </div>
            {/if}

            {#each opened.archives as archive}
              {#if archive.standing === 'holds' && archive.renewedBy && (archive.changed.length > 0 || archive.missing.length > 0)}
                <div class="notice">
                  <strong>An older archive timestamp no longer matches, and a newer one covers it.</strong>
                  So the protection here rests on the newer one.<Info
                    >Evidence is added to a signature file as it is renewed, so the file an older archive timestamp
                    listed can legitimately differ from the one here.</Info
                  >
                </div>
              {:else if archive.standing === 'holds' && (archive.changed.length > 0 || archive.missing.length > 0)}
                <div class="notice bad">
                  <strong>Part of what the archive timestamp lists has changed.</strong>
                  <span class="outgoing-list">
                    {#each archive.changed as name}
                      <span><strong translate="no">{printable(name)}</strong> is not what it stamped.</span>
                    {/each}
                    {#each archive.missing as name}
                      <span><strong translate="no">{printable(name)}</strong> was stamped and is no longer here.</span>
                    {/each}
                  </span>
                </div>
              {:else if archive.standing === 'holds' && !archive.coversEverySignature}
                <div class="notice warn">
                  <strong>The archive timestamp does not cover every signature here.</strong>
                  A signature outside it gets no long-term protection from it.
                </div>
              {:else if archive.standing === 'holds'}
                <div class="notice ok">
                  <strong>An archive timestamp covers the signatures here.</strong>
                  {archive.signedBy ?? 'An authority'} dated it {when(archive.time!)}.<Info
                    >It renews the evidence for everything it lists, so that evidence can outlast the
                    certificates behind it. Whether that authority is worth believing is {containerJudge}'s call.</Info
                  >
                </div>
              {:else if archive.standing === 'other-signature'}
                <div class="notice bad">
                  <strong>The archive timestamp is not for this list of files.</strong>
                  It attests to something else, so it protects nothing here.
                </div>
              {:else if archive.standing === 'broken'}
                <div class="notice bad">
                  <strong>The archive timestamp does not hold up.</strong>
                  It does not check out against its own certificate, so it protects nothing here.
                </div>
              {:else}
                <div class="notice warn">
                  <strong>The archive timestamp could not be checked.</strong> No finding here rests on it.
                </div>
              {/if}
            {/each}

            {#if opened.uncheckedEvidence}
              <div class="notice">
                <strong>It carries an evidence record this check does not read.</strong> No finding here rests on it.
              </div>
            {/if}

            {#if opened.signatures.length > 0}
              <!-- The container's own limit: true of every result, so it stays on screen. -->
              <div class="notice">
                <strong>This shows the signatures still here,</strong> not all there ever were. Taking one out
                of a container leaves no trace.
              </div>
            {/if}
          </div>

          {#each opened.signatures as signature, index}
            <div class="flow-panel">
              <h2 class="panel-title">{titleOf(index)}</h2>

              {#if signature.verdict === 'intact' && signature.counters !== null}
                <div class="notice ok">
                  <strong>The signature it counter-signs has not changed since.</strong>
                  {#if signature.covers.length > 0}
                    Nor {signature.covers.length === 1 ? 'has the file' : `have the ${signature.covers.length} files`} it also signs.
                  {/if}
                </div>
              {:else if signature.verdict === 'intact'}
                <div class="notice ok">
                  <strong>
                    {signature.covers.length === 1 ? 'The file it covers has' : `The ${signature.covers.length} files it covers have`}
                    not changed since it was {signature.form === 'timestamp' ? 'stamped' : 'signed'}.
                  </strong>
                </div>
              {:else if signature.verdict === 'altered'}
                <div class="notice bad">
                  {#if signature.changed.length > 0 || signature.missing.length > 0}
                    <strong>This container has been changed.</strong>
                    <span class="outgoing-list">
                      {#each signature.changed as name}
                        <span><strong translate="no">{printable(name)}</strong> is not the file that was signed.</span>
                      {/each}
                      {#each signature.missing as name}
                        <span><strong translate="no">{printable(name)}</strong> was signed and is no longer here.</span>
                      {/each}
                    </span>
                  {/if}
                  {#if signature.detailsChanged}
                    <strong>What this signature states has been changed.</strong>
                    Its signed details no longer match it, so the time and the certificate in them mean nothing.
                  {/if}
                  {#if signature.counterChanged}
                    <strong>The signature this counter-signs has been changed.</strong>
                    It no longer matches what was counter-signed.
                  {/if}
                </div>
              {:else if signature.verdict === 'broken'}
                <div class="notice bad">
                  <strong>The signature does not hold up.</strong>
                  {signature.detail} So it says nothing about the files.
                </div>
              {:else if signature.verdict === 'covers-nothing'}
                <div class="notice warn">
                  <strong>This signature signs none of the files in this container.</strong>
                  It may be sound, and it is no evidence for anything you can see here.
                </div>
              {:else if signature.verdict === 'cannot-check'}
                <div class="notice warn">
                  <strong>Could not check this one.</strong>
                  {signature.detail} That says nothing either way about whether it holds.
                </div>
              {:else}
                <div class="notice warn">
                  <strong>Could not read it.</strong>
                  {signature.detail}
                </div>
              {/if}

              <div class="facts">
                {#if signature.time}
                  <div>
                    <span>{signature.form === 'timestamp' ? 'Stated time' : "Signer's own clock"}</span>
                    <strong>{when(signature.time)}</strong>
                  </div>
                {/if}
                {#if signature.signedBy}
                  <div><span>Signed by</span><strong translate="no">{signature.signedBy}</strong></div>
                {/if}
                {#if signature.timestamp}
                  <div>
                    <span>Timestamped</span>
                    <strong>
                      {when(signature.timestamp.time)}{signature.timestamp.signedBy
                        ? ` by ${signature.timestamp.signedBy}`
                        : ''}
                    </strong>
                  </div>
                {/if}
              </div>

              <SignerChecks
                {signature}
                signerClock={signature.time}
                carriedRevocation={signature.revocation}
                isTimestamp={signature.form === 'timestamp'}
                judge={containerJudge}
                goTo={`${containerJudge} can say that`}
              >
                {#if signature.revocation}
                  {@const answer = signature.revocation}
                  {@const source = answer.from ?? 'An unnamed source'}
                  {#if answer.standing === 'broken'}
                    <div class="notice bad">
                      <strong>The revocation answer it carries does not hold up.</strong>
                      It does not check out against its own certificate, so it says nothing.
                    </div>
                  {:else if answer.standing === 'cannot-check'}
                    <div class="notice warn">
                      <strong>The revocation answer it carries could not be checked.</strong> So it says nothing
                      here.<Info>The certificate it was made with is not here, or it uses something this browser cannot compute.</Info>
                    </div>
                  {:else if answer.status === 'revoked'}
                    <div class="notice bad">
                      <strong>It carries an answer saying this certificate was revoked.</strong>
                      {source} said so {answer.at ? when(answer.at) : ''}{answer.revokedAt ? `, giving ${when(answer.revokedAt)} as the time of revocation` : ''}.
                      Compare that with when it was signed.
                    </div>
                  {:else if answer.status === 'unknown'}
                    <div class="notice warn">
                      <strong>It carries an answer that does not know this certificate.</strong>
                      {source} said so {answer.at ? when(answer.at) : ''}.
                    </div>
                  {:else}
                    <div class="notice">
                      <strong>It carries an answer saying this certificate was not revoked.</strong>
                      {source} said so {answer.at ? when(answer.at) : ''}. Who answered is not checked.<Info
                        >Read from the signature, not asked for: nothing left this device. It verifies against the
                        certificate it names, but anyone can add such an answer to a file, and nothing here shows
                        {source} is entitled to give one. That is {containerJudge}'s call.</Info
                      >
                    </div>
                  {/if}
                {/if}

                {#each signature.archiveTimestamps as stamp}
                  {#if stamp.standing === 'holds'}
                    <div class="notice ok">
                      <strong>An archive timestamp also covers this signature.</strong>
                      {stamp.signedBy ?? 'An authority'} dated it {when(stamp.time)}.
                    </div>
                  {:else if stamp.standing === 'broken'}
                    <div class="notice bad">
                      <strong>The archive timestamp on this signature does not hold up.</strong>
                      It does not check out against its own certificate, so it protects nothing.
                    </div>
                  {:else}
                    <div class="notice warn">
                      <strong>The archive timestamp on this signature could not be confirmed.</strong> No finding here
                      rests on it.<Info
                        >What it covers has to be reassembled from many parts, and writers have read those rules
                        differently. That could be damage, or only this check's reading, so it says nothing either way.</Info
                      >
                    </div>
                  {/if}
                {/each}

                {#each signature.unchecked as part}
                  <div class="notice">
                    {#if part === 'counter-signature'}
                      <strong>It carries a further counter-signature this check does not read.</strong> Nobody is named
                      or vouched for by it here.
                    {:else}
                      <strong>It carries an archive timestamp this check does not read.</strong> No finding here
                      rests on it.
                    {/if}
                  </div>
                {/each}

                {#snippet limits()}
                  Any revocation answer above is one the signature carried; nothing newer was asked for.
                {/snippet}
              </SignerChecks>
            </div>
          {/each}
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
                <div><span>Signed by</span><strong translate="no">{result.signedBy}</strong></div>
              {/if}
              {#if result.policy}
                <div><span>Policy</span><code translate="no">{result.policy}</code></div>
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

            <SignerChecks
              signature={result}
              signerClock={result.isTimestamp ? null : result.time}
              isTimestamp={result.isTimestamp}
              judge="your PDF reader"
              goTo="open the file in a PDF reader for that"
            >
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
              {#snippet limits()}
                {#if !result.isTimestamp}
                  Reason and Location were typed by whoever signed; nothing makes them true.
                {/if}
              {/snippet}
            </SignerChecks>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  .container-file {
    align-items: center;
  }

  .container-file-name {
    color: var(--ink);
    font-weight: 650;
    overflow-wrap: anywhere;
    flex: 1 1 200px;
  }

  .container-file-facts {
    flex: 2 1 240px;
  }
</style>
