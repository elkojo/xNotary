<script lang="ts">
  import { DSS_SOURCE_URL } from '../lib/certificate2';
  import { CALENDAR_URLS } from '../lib/ots';
  import type { View } from '../nav';

  interface Props {
    go: (view: View) => void;
  }
  let { go }: Props = $props();

  /** The Commission's own explanation of what qualified status actually confers. */
  const ESIGNATURE_FAQ_URL =
    'https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/880312429/eSignature+FAQ';

  /**
   * Czechia's methodology for when an electronic signature may stand in for an
   * officially verified one. Named because "notarization" invites exactly that
   * inference, and the conditions are not ones xNotary can check.
   */
  const DIA_SUBSTITUTION_URL =
    'https://www.dia.gov.cz/cs/legislativa/eidas-sluzby-vytvarejici-duveru-a-elektronicka-identifikace/informace-pro-uzivatele/pravo-na-nahrazeni-uredne-overeneho-podpisu-dle-ss-6-odst-2-zakona-c-12-2020-sb';

  /** Emitted by the build, so these resolve on a deployed site, not in `npm run dev`. */
  const base = import.meta.env.BASE_URL;
  const NOTICES_URL = `${base}THIRD-PARTY.txt`;
  const RELINKING_URL = `${base}vendor/README.md`;
  const SOURCE_URL = 'https://github.com/elkojo/xNotary';

  /**
   * The source of *this* build, not just of the project. Stamped in by
   * vite.config.ts; a build made from uncommitted changes is marked `-dirty`
   * and gets no commit link, because there is no public commit to point at.
   */
  const revision = __APP_REVISION__;
  const commit = __APP_COMMIT__;
  const revisionUrl =
    commit && !revision.endsWith('-dirty') ? `${SOURCE_URL}/tree/${commit}` : null;
</script>

<section class="product-view">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>How xNotary works</h1>
        <p>An evidence layer for documents — without sending the document to anyone.</p>
      </div>
      <button class="button dark" onclick={() => go('notarize')}>Create your first proof</button>
    </div>

    <div class="single-card">
      <h2 class="section-title">From file to verifiable proof</h2>
      <p class="section-copy">Three steps. The original document stays under your control.</p>

      <div class="how-grid">
        <article class="how-step">
          <span class="how-number">01 / Fingerprint</span>
          <h3>Your browser reads the file</h3>
          <p>
            It computes a SHA-256 fingerprint on this device. The file itself never leaves it, and
            the digest reveals nothing about what is inside.
          </p>
        </article>
        <article class="how-step">
          <span class="how-number">02 / Anchor</span>
          <h3>The fingerprint goes into Bitcoin</h3>
          <p>
            Only the 32-byte digest is sent, to public OpenTimestamps calendars, which batch many
            digests into one Bitcoin transaction. xNotary itself receives and keeps nothing.
          </p>
        </article>
        <article class="how-step">
          <span class="how-number">03 / Verify</span>
          <h3>Anyone can check it</h3>
          <p>
            The document and its certificate can be checked later by anyone — here, or with the
            reference OpenTimestamps client and no xNotary at all.
          </p>
        </article>
      </div>

      <div class="boundary-grid">
        <div class="boundary yes">
          <h3>What a certificate shows</h3>
          <ul>
            <li>The exact fingerprint of one file</li>
            <li>That it existed no later than a particular Bitcoin block</li>
            <li>Who signed it, among those who consented to be named</li>
            <li>Whether a file you hold still matches</li>
          </ul>
        </div>
        <div class="boundary no">
          <h3>What it does not show</h3>
          <ul>
            <li>That anything stated inside the document is true</li>
            <li>A signer's authority, unless verified separately</li>
            <li>Verification of a signature by a public authority</li>
            <li>That a signature meets any framework's highest tier</li>
          </ul>
        </div>
      </div>

      <!-- Direction, not capability — the same words as the landing page. -->
      <div class="vision-strip">
        <div>
          <strong>One evidence layer, more kinds of agreement.</strong>
          <p>
            We intend to extend this from human signatures to delegated authority and contracts
            between authorised software agents. None of that exists yet.
          </p>
        </div>
        <span>Documents → people → agents</span>
      </div>
    </div>

    <!--
      Examples, not features. Each one is here because it is the only place a
      particular property is shown concretely — the agreement check, the file
      never leaving the device, the recipient needing nothing, the limit on what
      a timestamp can mean, and a certificate outliving this app. Folded by
      default: five open cases would bury the page they are meant to introduce.
    -->
    <div class="single-card">
      <h2 class="section-title">What people use it for</h2>
      <p class="section-copy">
        Timestamping fixes <em>what</em> a document was and <em>when</em>. It says nothing about
        <em>who</em> — that is what a signature adds. A trust provider checks a person's identity
        before issuing their certificate, so a signed document carries a name someone stood behind
        rather than one typed into a form. Certificate 2 records those names with the authority that
        issued each, and points you to the check that confirms them.
      </p>

      <div class="case-list">
        <details class="explain">
          <summary>A contract signed in two countries, with no shared platform</summary>
          <div>
            Two companies agree terms, and neither wants to run the deal through the other's signing
            service. Timestamp the final PDF, send it to everyone, and each party signs their own
            copy in their own tool. Drop the signed copies back in together with the proof:
            Certificate 2 names who signed, having first established that they all signed the same
            document. Where a signature comes from a trust provider — one that checked who the
            person was before issuing their certificate — the page records not just that someone
            signed, but whom an authority vouched for.
          </div>
        </details>

        <details class="explain">
          <summary>A confidential record, dated before you disclose it</summary>
          <div>
            An engineer wants dated evidence that a design existed before a filing or a conversation
            — without showing it to anyone, us included. The file is hashed on your own machine and
            only the 32-byte fingerprint is sent, so a Bitcoin block dates a document nobody else
            has seen. Sign it as well and the record says who made it, not only that it existed,
            which is usually the point when the question is authorship.
          </div>
        </details>

        <details class="explain">
          <summary>Proving what you delivered</summary>
          <div>
            An agency hands over a report, a build or a set of drawings, and both sides want the
            delivered version fixed. Timestamp it, send it with its Certificate 1, and the client
            checks the match on the <strong>Verify</strong> screen — no account, no upload, nothing
            to install. “That isn't what you sent” becomes a question with an answer. If the sender
            signs the delivery, the certificate also records who sent it; if the client signs their
            copy back, who accepted it.
          </div>
        </details>

        <details class="explain">
          <summary>Preserving a record before it changes</summary>
          <div>
            An investigator exports a chat log, a page or an account statement that may not exist in
            that form next week. Timestamping fixes both the bytes and the date, so an edited or
            re-exported copy is visibly a different file. A signature from the person who made the
            export adds who is standing behind it — the part a timestamp cannot supply. It proves
            the export existed and is unchanged; not that what it says is true.
          </div>
        </details>

        <details class="explain">
          <summary>A release anyone can still check in ten years</summary>
          <div>
            A maintainer timestamps a release artifact and its checksums. Years later, anyone
            holding the download can confirm it is what was published — with the reference
            OpenTimestamps client and a Bitcoin node, with no xNotary, no code host and no trust in
            either. Sign the release too and the same check tells them who published it, not only
            that the bytes are unchanged. That is the test every certificate here is built to pass.
          </div>
        </details>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">What xNotary does</h2>
      <p class="section-copy">
        Two kinds of proof, in the order you would actually use them. Both work today. Step 2
        happens outside xNotary — that is the point of it, not a gap.
      </p>
      <div class="review-box">
        <div class="review-row">
          <span>1 · Timestamp</span>
          <div>
            <strong>Certificate 1 — integrity and existence.</strong> This exact file existed no
            later than a particular Bitcoin block. Your file is hashed here and never leaves the
            device.
          </div>
        </div>
        <div class="review-row">
          <span>2 · Sign</span>
          <div>
            <strong>With your own tools, not here.</strong> You and the other parties sign — ideally
            the document itself, otherwise its Certificate 1 — using signatures from a provider you
            already trust. xNotary never issues, holds or sees a signing key, and never sends anyone
            a signing invitation.
          </div>
        </div>
        <div class="review-row">
          <span>3 · Signatures</span>
          <div>
            <strong>Certificate 2 — who signed.</strong> Drop in the signed files, confirm who may
            be named, and get a one-page PDF listing them with their issuing authority and signing
            time, the signed documents embedded inside it. Add the Certificate 1 or its
            <span class="mono">proof.ots</span> and it also establishes that the signatures are over
            the timestamped document itself.
          </div>
        </div>
        <div class="review-row">
          <span>4 · Verify</span>
          <div>
            <strong>For whoever receives it.</strong> Anyone holding the document and its
            Certificate 1 can check two things: that this file is the one the certificate is about,
            and that the timestamp is real. It does not check signatures — see
            <em>Not a validation result</em> below.
          </div>
        </div>
        <div class="review-row">
          <span>My certificates</span>
          <div>
            The Certificate 1s made on this device, kept in this browser only so a pending timestamp
            can be upgraded to confirmed once Bitcoin catches up. Nothing else is stored, anywhere.
          </div>
        </div>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">How the timestamp works</h2>
      <p class="section-copy">
        Your file is hashed here, in your browser. Only the resulting 32-byte SHA-256 digest is sent
        — to public OpenTimestamps calendar servers, which batch many digests into a single Bitcoin
        transaction. The digest reveals nothing about the file's contents, and the file itself is
        never uploaded to anyone, including us. There is no “us”: xNotary has no backend.
      </p>
      <div class="review-box">
        <div class="review-row">
          <span>Calendars used</span>
          <div>
            {#each CALENDAR_URLS as url}
              <div class="mono">{url.hostname}</div>
            {/each}
          </div>
        </div>
        <div class="review-row">
          <span>Pending</span>
          <div>
            Right after stamping, a calendar has promised to anchor your digest but no Bitcoin block
            contains it yet. This is normal and usually resolves within a few hours.
          </div>
        </div>
        <div class="review-row">
          <span>Confirmed</span>
          <div>
            Once anchored, the proof stands on its own: it can be checked against the Bitcoin
            blockchain by anyone, forever, with no calendar and no xNotary involved.
          </div>
        </div>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">Verifying without xNotary</h2>
      <p class="section-copy">
        This matters more than the app. If xNotary disappears tomorrow, your certificates must still
        be provable — so nothing here is a proprietary format.
      </p>
      <ol style="color:var(--ink-soft);font-size:13px;line-height:1.8">
        <li>Install the reference client: <code>pip install opentimestamps-client</code></li>
        <li>
          Detach <code>proof.ots</code> from the Certificate 1 PDF — or from a Certificate 2, which
          carries it too when the document itself was signed — using any reader with an attachments
          panel. Or use the <code>.ots</code> file you saved.
        </li>
        <li>Run <code>ots verify -f your-document.pdf proof.ots</code></li>
      </ol>
      <p class="section-copy" style="margin:12px 0 0">
        The client recomputes the digest itself and queries Bitcoin directly. It will print the
        block height and the attested time.
      </p>
    </div>

    <div class="single-card">
      <h2 class="section-title">Getting a signature</h2>
      <p class="section-copy">
        Certificate 2 records signatures made over the document, or over its Certificate 1. xNotary
        deliberately does not issue, hold, or broker signing keys — you bring your own signature,
        from a provider you already trust. Any PAdES signature can be read and attested, wherever it
        was issued. How much legal weight it carries is a question for the law that applies to you:
        most frameworks define a highest tier and a list of providers entitled to issue one.
      </p>
      <p class="section-copy">
        In the EU that tier is the qualified electronic signature (QES) under eIDAS — a qualified
        certificate on a qualified signature creation device, issued by a qualified trust service
        provider. In Czechia those providers are:
      </p>
      <div class="review-box">
        <div class="review-row">
          <span>I.CA</span>
          <div>
            První certifikační autorita —
            <a href="https://www.ica.cz/" target="_blank" rel="noopener noreferrer">ica.cz</a>
          </div>
        </div>
        <div class="review-row">
          <span>PostSignum</span>
          <div>
            Česká pošta —
            <a href="https://www.postsignum.cz/" target="_blank" rel="noopener noreferrer">
              postsignum.cz</a
            >
          </div>
        </div>
        <div class="review-row">
          <span>eIdentity</span>
          <div>
            eIdentity a.s. —
            <a href="https://www.eidentity.cz/" target="_blank" rel="noopener noreferrer">
              eidentity.cz</a
            >
          </div>
        </div>
      </div>
      <p class="section-copy" style="margin:16px 0 0">
        Outside the EU, use whatever your own framework recognises: xNotary reads the signature the
        same way either way, and names the authority that issued it. You sign with the tool your
        provider gives you — the document itself for preference, otherwise its Certificate 1 — then
        send the signed PDF back to whoever is assembling Certificate 2. Your private key never
        touches xNotary.
      </p>
    </div>

    <div class="single-card">
      <h2 class="section-title">Bank iD SIGN is not a qualified signature</h2>
      <div class="notice warn" style="margin-top:0">
        Bank iD SIGN does <strong>not</strong> produce a qualified electronic signature. It is listed
        here separately because it is often assumed to.
      </div>
      <p class="section-copy" style="margin-top:16px">
        Bank iD is an identity scheme, not a signing certificate: your bank confirms who you are,
        and the document is then sealed with Bank iD's own qualified electronic <em>seal</em>. What
        the signer ends up with is an advanced electronic signature —
        <em>zaručený elektronický podpis</em> — carrying strong identity evidence, but not the
        qualified status that only a qualified certificate on a qualified device confers. The
        difference is legal, not cosmetic: where a law, an authority, or a counterparty requires a
        QES, Bank iD SIGN will not satisfy it.
      </p>
      <p class="section-copy" style="margin-bottom:0">
        xNotary accepts it all the same. Certificate 2 records the signature and reports what its
        certificate claims — it never upgrades an advanced signature into a qualified one, and it
        never states that any signature is qualified. Validate the certificate the way every
        Certificate 2 describes, to find out which of the two you are holding.
      </p>
    </div>

    <div class="single-card">
      <h2 class="section-title">What xNotary keeps</h2>
      <p class="section-copy">
        Nothing, on any server — because there is no server. xNotary is a static page that runs
        entirely in your browser; there is nowhere for it to put your documents even if it wanted
        to.
      </p>
      <div class="review-box">
        <div class="review-row">
          <span>Your files</span>
          <div>
            Never uploaded. They are hashed on this device and only the 32-byte digest is sent, to
            the public OpenTimestamps calendars.
          </div>
        </div>
        <div class="review-row">
          <span>Certificate 2</span>
          <div>
            Not stored at all, not even here. It is built in the tab and handed to you to save.
            Close the tab and it is gone — so save it somewhere you back up. Nothing is lost if you
            forget: it can be rebuilt at any time from the same signed files.
          </div>
        </div>
        <div class="review-row">
          <span>Certificate 1</span>
          <div>
            The one exception, kept in this browser's own storage on this device, so that a pending
            Bitcoin timestamp can be upgraded to confirmed later. It is not sent anywhere, and you
            can delete it from <em>My certificates</em> whenever you like. Clearing your browser data
            removes it too — keep the downloaded PDF as your real copy.
          </div>
        </div>
      </div>
      <p class="section-copy" style="margin:16px 0 0">
        This is the point of the design rather than a gap in it. A service that never holds your
        documents cannot leak them, cannot be compelled to hand them over, and cannot lose them.
      </p>
    </div>

    <div class="single-card">
      <h2 class="section-title">Limits you should know about</h2>
      <div class="review-box">
        <div class="review-row">
          <span>Not a signature</span>
          <div>
            Certificate 1 proves a file existed at a time. It says nothing about who made it or what
            it means. Certificate 2 records who signed, and what they signed: the document itself
            when the proof links the two, otherwise its Certificate 1 — which is not the same thing,
            and the certificate says which of them it is.
          </div>
        </div>
        <div class="review-row">
          <span>Not a validation result</span>
          <div>
            Certificate 2 reports what each signature and its certificate <em>claim</em>. xNotary
            can check integrity and read certificate data, but it does not check those certificates
            against any trust list, so it never states what legal status a signature has. This
            matters wherever you are: a law that treats an electronic signature as equivalent to a
            handwritten one makes that equivalence conditional on the signature actually meeting the
            conditions. In the EU that is the QES under eIDAS — see the Commission's
            <a href={ESIGNATURE_FAQ_URL} target="_blank" rel="noopener noreferrer">
              eSignature FAQ</a
            >. Every Certificate 2 prints how to get that determination from something that can give
            it:
            <a href={DSS_SOURCE_URL} target="_blank" rel="noopener noreferrer">DSS</a> run on your own
            machine, or a validation service from a trust provider.
          </div>
        </div>
        <div class="review-row">
          <span>Not officially verified</span>
          <div>
            Where a law requires a signature to be verified by an official — notarized — an
            electronic signature stands in for it only on that jurisdiction's own terms, and xNotary
            neither checks those terms nor certifies that they are met. Czechia is the worked
            example: § 6(2) of Act 12/2020 Sb. grants the right, but only where it can be verified
            <em>from population register data</em> that the qualified certificate belongs to the
            signer — a check requiring register access that a page running in your browser does not
            have. § 6(3) excludes some cases outright. See the
            <a href={DIA_SUBSTITUTION_URL} target="_blank" rel="noopener noreferrer">
              DIA methodology</a
            >.
          </div>
        </div>
        <div class="review-row">
          <span>Not an accredited timestamp</span>
          <div>
            The Bitcoin anchor is strong evidence, and it is checkable by anyone anywhere without
            trusting a provider — but it is not a timestamp from an accredited trust service, which
            in the EU means a qualified electronic timestamp under eIDAS. Support for an RFC 3161
            timestamp alongside it is the first post-MVP milestone.
          </div>
        </div>
        <div class="review-row">
          <span>No long-term validation</span>
          <div>
            xNotary does not yet embed PAdES-LTA/LTV data. Certificates and revocation information
            can expire; signers' own tools often add this.
          </div>
        </div>
        <div class="review-row">
          <span>Nothing is backed up</span>
          <div>
            Self-custody cuts both ways. Clear your browser data and your library is gone. Save your
            certificates somewhere you keep things.
          </div>
        </div>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">Licensing</h2>
      <p class="section-copy">
        xNotary is free software: <strong>AGPL-3.0-or-later</strong>. The
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">source</a> is public, which is
        what lets anyone check that the claims on this page are true of the code actually running.
      </p>
      <div class="review-box">
        <div class="review-row">
          <span>This build</span>
          <div>
            {#if revisionUrl}
              <a href={revisionUrl} target="_blank" rel="noopener noreferrer">
                <span class="mono">{revision}</span>
              </a> — the exact source this page was built from. Anyone running xNotary as a service owes
              you that, not merely a link to the project.
            {:else}
              <span class="mono">{revision}</span> — built from changes that are not in any published
              commit, so there is nothing to link. A deployed build should never say this.
            {/if}
          </div>
        </div>
        <div class="review-row">
          <span>Third-party code</span>
          <div>
            Everything your browser downloaded, with its licence, is listed in
            <a href={NOTICES_URL}>THIRD-PARTY.txt</a> — generated at build time from the modules actually
            present, so it cannot drift from what was shipped.
          </div>
        </div>
        <div class="review-row">
          <span>OpenTimestamps library</span>
          <div>
            The OpenTimestamps client is licensed LGPL-3.0-or-later. It is loaded as a separate
            module rather than bundled in, so you can build your own version of it and have this app
            run against yours instead: see <a href={RELINKING_URL}>how to relink it</a>.
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
