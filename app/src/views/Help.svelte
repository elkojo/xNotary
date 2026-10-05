<!--
  How it works and the questions people ask, on one page. Everything past the
  three steps is folded, so the page shows its questions and nothing else until
  one is opened: the screens keep their explanations in ⓘ bubbles, and each
  bubble's "More" link lands on its answer here (`#/help/<topic>`), opened.

  The answers carried over from the former Q&A screen keep their wording.
  The rest is what "How it works" said, regrouped under the question it answers.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { DSS_SOURCE_URL } from '../lib/certificate2';
  import { CALENDAR_URLS } from '../lib/ots';
  import type { View } from '../nav';

  interface Props {
    go: (view: View) => void;
    /** The question to open and scroll to, from `#/help/<topic>`. */
    topic?: string;
  }
  let { go, topic = '' }: Props = $props();

  $effect(() => {
    if (!topic) return;
    tick().then(() => {
      const target = document.getElementById(`q-${topic}`);
      if (!(target instanceof HTMLDetailsElement)) return;
      target.open = true;
      target.scrollIntoView({ block: 'start' });
    });
  });

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
        <h1>Help</h1>
      </div>
      <button class="button dark" onclick={() => go('notarize')}>Timestamp a document</button>
    </div>

    <div class="single-card">
      <h2 class="section-title">How it works</h2>
      <div class="how-grid">
        <article class="how-step">
          <span class="how-number">01 / Fingerprint</span>
          <h3>Your browser reads the file</h3>
          <p>It computes a SHA-256 fingerprint. The file never leaves this device.</p>
        </article>
        <article class="how-step">
          <span class="how-number">02 / Anchor</span>
          <h3>The fingerprint goes into Bitcoin</h3>
          <p>Public OpenTimestamps calendars anchor the 32-byte fingerprint, and nothing else.</p>
        </article>
        <article class="how-step">
          <span class="how-number">03 / Verify</span>
          <h3>Anyone can check it</h3>
          <p>Here, or with the reference OpenTimestamps client and no xNotary at all.</p>
        </article>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">About xNotary</h2>
      <div class="case-list">
        <details class="explain" id="q-what">
          <summary>What is xNotary?</summary>
          <div>
            xNotary is building a way to prove who agreed to what, without an official witnessing
            each transaction, an appointment or physical presence. The beta covers two layers:
            verifiable evidence of a digital document’s exact contents and existence in time, and
            the collection of qualified electronic signatures made over that evidence. Verified
            identity and authoritative signature validation are the layers still to come, not
            capabilities to assume from a timestamp.
          </div>
        </details>

        <details class="explain" id="q-does">
          <summary>What does each screen do?</summary>
          <div>
            <div class="review-box">
              <div class="review-row">
                <span>Timestamp</span>
                <div>
                  <strong>Certificate 1 — integrity and existence.</strong> This exact file existed
                  no later than a particular Bitcoin block. Your file is hashed here and never
                  leaves the device.
                </div>
              </div>
              <div class="review-row">
                <span>Sign</span>
                <div>
                  <strong>With your own tools, not here.</strong> You and the other parties sign —
                  ideally the document itself, otherwise its Certificate 1 — using signatures from a
                  provider you already trust. xNotary never issues, holds or sees a signing key, and
                  never sends anyone a signing invitation.
                </div>
              </div>
              <div class="review-row">
                <span>Certify signers</span>
                <div>
                  <strong>Certificate 2 — who signed.</strong> Drop in the signed files, confirm who
                  may be named, and get a one-page PDF listing them with their issuing authority and
                  signing time, the signed documents embedded inside it. Add the Certificate 1 or its
                  <span class="mono">proof.ots</span> and it also establishes that the signatures
                  are over the timestamped document itself.
                </div>
              </div>
              <div class="review-row">
                <span>Verify proof</span>
                <div>
                  <strong>For whoever receives it.</strong> Anyone holding the document and its
                  Certificate 1 can check that this file is the one the certificate is about, and
                  that the timestamp is real. It does not check signatures.
                </div>
              </div>
              <div class="review-row">
                <span>My certificates</span>
                <div>
                  The Certificate 1s made in this browser, kept so a pending timestamp can be
                  upgraded once Bitcoin catches up.
                </div>
              </div>
            </div>
          </div>
        </details>

        <details class="explain" id="q-cost">
          <summary>What does xNotary cost? Do I need bitcoin?</summary>
          <div>
            <p>
              Nothing. xNotary is free and open source, with no accounts, no charge per document and
              no transaction fees — your fingerprint is aggregated with many others before it
              reaches Bitcoin, which is why timestamping costs nothing.
            </p>
            <p>
              You do not need to buy bitcoin or connect a wallet. Bitcoin supplies the public record
              used for verification. A change in its market price does not itself change your file
              or erase its proof.
            </p>
          </div>
        </details>

        <details class="explain" id="q-beta">
          <summary>What can the beta prove today?</summary>
          <div>
            Two things. A completed and verified proof — Certificate 1 — supports that the exact
            file existed before the relevant Bitcoin block, and lets you check whether a file
            matches it. Where the parties then sign with certificates of their own, Certificate 2
            records who signed and which authority issued each certificate; given the timestamp
            proof as well, it also establishes that the signatures are over the timestamped document
            itself. It reads those signatures rather than validating them against a trust list, so
            it reports what they claim rather than confirming it.
          </div>
        </details>

        <details class="explain" id="q-direction">
          <summary>Where is this going?</summary>
          <div>
            Proof for people today; verifiable authority for software tomorrow. We intend to extend
            the same evidence layer from human signatures to remote multiparty agreements, delegated
            authority and contracts between authorised software agents. None of that exists yet.
          </div>
        </details>

        <details class="explain" id="q-licence">
          <summary>Licence and source</summary>
          <div>
            <p>
              xNotary is free software: <strong>AGPL-3.0-or-later</strong>. The
              <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">source</a> is public,
              which is what lets anyone check that the claims here are true of the code actually
              running.
            </p>
            <div class="review-box">
              <div class="review-row">
                <span>This build</span>
                <div>
                  {#if revisionUrl}
                    <a href={revisionUrl} target="_blank" rel="noopener noreferrer">
                      <span class="mono">{revision}</span>
                    </a> — the exact source this page was built from. Anyone running xNotary as a service
                    owes you that, not merely a link to the project.
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
                  <a href={NOTICES_URL}>THIRD-PARTY.txt</a> — generated at build time from the modules
                  actually present, so it cannot drift from what was shipped.
                </div>
              </div>
              <div class="review-row">
                <span>OpenTimestamps library</span>
                <div>
                  The OpenTimestamps client is licensed LGPL-3.0-or-later. It is loaded as a
                  separate module rather than bundled in, so you can build your own version of it
                  and have this app run against yours instead: see
                  <a href={RELINKING_URL}>how to relink it</a>.
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">Timestamps</h2>
      <div class="case-list">
        <details class="explain" id="q-how">
          <summary>How does the timestamp work?</summary>
          <div>
            <p>
              Your browser calculates a digital fingerprint of your file — a 32-byte SHA-256 digest
              that reveals nothing about its contents. Only that digest is sent, to public
              OpenTimestamps calendar servers, which batch many digests into a single Bitcoin
              transaction. Verification recalculates the fingerprint and checks the connection. Even
              a tiny change to the file produces a different fingerprint, so the changed file will
              not match the original proof.
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
                <span>Confirmed</span>
                <div>
                  Once anchored, the proof stands on its own: it can be checked against the Bitcoin
                  blockchain by anyone, forever, with no calendar and no xNotary involved.
                </div>
              </div>
            </div>
          </div>
        </details>

        <details class="explain" id="q-pending">
          <summary>Why does my proof say “Pending anchor”?</summary>
          <div>
            The request has been accepted, but its Bitcoin proof is not complete yet. Anchoring
            waits for at least one Bitcoin block and often several, so expect anywhere from about
            twenty minutes to a few hours. Save the pending proof, return later and use Upgrade,
            then verify and save the completed version. The proof establishes existence before the
            relevant Bitcoin block, not the exact moment you created or signed the document.
          </div>
        </details>

        <details class="explain" id="q-shows">
          <summary>What does a certificate show — and what not?</summary>
          <div>
            <div class="boundary-grid">
              <div class="boundary yes">
                <h3>It shows</h3>
                <ul>
                  <li>The exact fingerprint of one file</li>
                  <li>That it existed no later than a particular Bitcoin block</li>
                  <li>Who signed it, among those who consented to be named</li>
                  <li>That further signatures exist, without naming them</li>
                  <li>Whether a file you hold still matches</li>
                </ul>
              </div>
              <div class="boundary no">
                <h3>It does not show</h3>
                <ul>
                  <li>That anything stated inside the document is true</li>
                  <li>A signer's authority, unless verified separately</li>
                  <li>Verification of a signature by a public authority</li>
                  <li>That a signature meets any framework's highest tier</li>
                </ul>
              </div>
            </div>
          </div>
        </details>

        <details class="explain" id="q-backdate">
          <summary>Can someone timestamp a fake document or backdate it?</summary>
          <div>
            A false statement, copied work or AI-generated image can be timestamped. The proof
            establishes that file’s existence, not its truth or ownership. Changing a computer’s
            clock cannot create a valid proof linking a newly created file to an earlier Bitcoin
            block. Changing a timestamped file breaks its match with the original proof.
          </div>
        </details>

        <details class="explain" id="q-accredited">
          <summary>Is it an accredited timestamp?</summary>
          <div>
            No. The Bitcoin anchor is strong evidence, and it is checkable by anyone anywhere without
            trusting a provider — but it is not a timestamp from an accredited trust service, which
            in the EU means a qualified electronic timestamp under eIDAS. Support for an RFC 3161
            timestamp alongside it is the first post-MVP milestone.
          </div>
        </details>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">Signatures</h2>
      <div class="case-list">
        <details class="explain" id="q-signing">
          <summary>Where do I get a signature?</summary>
          <div>
            <p>
              From a provider you already trust — xNotary deliberately does not issue, hold, or
              broker signing keys, and your private key never touches it. Any PAdES signature can be
              read and attested, wherever it was issued. How much legal weight it carries is a
              question for the law that applies to you: most frameworks define a highest tier and a
              list of providers entitled to issue one.
            </p>
            <p>
              In the EU that tier is the qualified electronic signature (QES) under eIDAS — a
              qualified certificate on a qualified signature creation device, issued by a qualified
              trust service provider. In Czechia those providers are:
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
            <p>
              Outside the EU, use whatever your own framework recognises: xNotary reads the signature
              the same way either way, and names the authority that issued it.
            </p>
          </div>
        </details>

        <details class="explain" id="q-what-to-sign">
          <summary>Should we sign the document itself, or its Certificate 1?</summary>
          <div>
            Have everyone sign the document rather than the Certificate 1, then drop the signed
            document into <em>Certify signers</em> together with its Certificate 1 (or the
            <span class="mono">proof.ots</span>). xNotary checks that the timestamped bytes really
            are a revision of the file they signed, and Certificate 2 then says the signatures are
            over the document — carrying the proof along inside it. Signing the Certificate 1 still
            works; it just attests to the certificate rather than to the document.
          </div>
        </details>

        <details class="explain" id="q-parallel">
          <summary>Signing in parallel or in sequence?</summary>
          <div>
            In parallel, each signer gets their own copy to sign; drop all of them together and
            their signatures are pooled onto one certificate. In sequence, one file ends up carrying
            every signature — drop just that. Either way, xNotary first checks the files really are
            signatures over the same document, and refuses to combine them if they are not. There is
            no “complete” state and nothing expires: collect another signature later and issue a new
            Certificate 2.
          </div>
        </details>

        <details class="explain" id="q-contract">
          <summary>Can I use xNotary to sign a contract with someone?</summary>
          <div>
            Yes, with signatures from a provider each party already trusts. Timestamp the contract,
            and have everyone sign the contract itself in their own tool — each their own copy, or
            one file passed along. Then drop the signed files into <em>Certify signers</em> together
            with the Certificate 1 or its <span class="mono">proof.ots</span>. xNotary first
            establishes that every file is a signature over the same document, and that it is the
            document that was timestamped; Certificate 2 then names the signers who agreed to be
            named and attaches the signed files. One limit applies: xNotary reads the signatures
            without validating them against a trust list, so whether each one has the standing the
            contract needs — in the EU, typically a QES — is for an external validator to say.
          </div>
        </details>

        <details class="explain" id="q-naming">
          <summary>If I leave a signer off, are they anonymous?</summary>
          <div>
            No. Choosing not to name a signatory keeps them off the certificate's overview page,
            which says only how many others signed. It does not remove them from anything.
            Certificate 2 embeds the signed document unmodified — that is what makes it evidence —
            and every signature in it carries the certificate naming its signer, often with an email
            address and a personal identifier besides. That is where xNotary read the name in the
            first place, and any PDF reader can open the attachment and read it too. Nothing could
            strip it either: the certificate sits inside the bytes the signature is computed over,
            so removing it would break the signature it belongs to. If someone must not be
            identifiable at all, a certificate over that signed file is the wrong instrument — every
            Certificate 2 says so on its face.
          </div>
        </details>

        <details class="explain" id="q-validation">
          <summary>Does xNotary tell me whether a signature is qualified?</summary>
          <div>
            No. Certificate 2 reports what each signature and its certificate <em>claim</em>. xNotary
            can check integrity and read certificate data, but it does not check those certificates
            against any trust list, so it never states what legal status a signature has. This
            matters wherever you are: a law that treats an electronic signature as equivalent to a
            handwritten one makes that equivalence conditional on the signature actually meeting the
            conditions. In the EU that is the QES under eIDAS — see the Commission's
            <a href={ESIGNATURE_FAQ_URL} target="_blank" rel="noopener noreferrer"> eSignature FAQ</a
            >. Every Certificate 2 prints how to get that determination from something that can give
            it:
            <a href={DSS_SOURCE_URL} target="_blank" rel="noopener noreferrer">DSS</a> run on your own
            machine, or a validation service from a trust provider. In the EU, only a qualified
            provider's validation carries the presumption eIDAS attaches.
          </div>
        </details>

        <details class="explain" id="q-bankid">
          <summary>Is Bank iD SIGN a qualified signature?</summary>
          <div>
            <p>
              <strong>No.</strong> Bank iD is an identity scheme, not a signing certificate: your
              bank confirms who you are, and the document is then sealed with Bank iD's own qualified
              electronic <em>seal</em>. What the signer ends up with is an advanced electronic
              signature — <em>zaručený elektronický podpis</em> — carrying strong identity evidence,
              but not the qualified status that only a qualified certificate on a qualified device
              confers. The difference is legal, not cosmetic: where a law, an authority, or a
              counterparty requires a QES, Bank iD SIGN will not satisfy it.
            </p>
            <p>
              xNotary accepts it all the same. Certificate 2 records the signature and reports what
              its certificate claims — it never upgrades an advanced signature into a qualified one,
              and it never states that any signature is qualified.
            </p>
          </div>
        </details>

        <details class="explain" id="q-viewer-name">
          <summary>Does the name shown in the signature viewer prove who signed?</summary>
          <div>
            No. <em>Certify signers</em> reads the name from the certificate inside each signature
            and checks that the signed content still matches the digest the signature records —
            that is what “Signed content intact” means. It does not verify the signature value
            against the signer's key, and it checks no certificate against a trust list. A
            displayed name is therefore what the signature claims, not a verified identity. To
            authenticate the signer, validate the signed document with
            <a href={DSS_SOURCE_URL} target="_blank" rel="noopener noreferrer">DSS</a> or a trust
            provider.
          </div>
        </details>

        <details class="explain" id="q-ltv">
          <summary>Does it add long-term validation data?</summary>
          <div>
            Not yet: xNotary does not embed PAdES-LTA/LTV data. Certificates and revocation
            information can expire; signers' own tools often add this.
          </div>
        </details>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">Verifying</h2>
      <div class="case-list">
        <details class="explain" id="q-verified">
          <summary>What does “verified” mean?</summary>
          <div>
            That the file matches the certificate's fingerprint byte for byte, and the proof checks
            out against Bitcoin as far as it could be checked. Nothing more: not who signed — that
            is Certificate 2 — and nothing about what the document says or means. Checking the
            timestamp only asks public block explorers about a block that is already public; the
            files themselves are read on your device.
          </div>
        </details>

        <details class="explain" id="q-without">
          <summary>How do I verify without xNotary?</summary>
          <div>
            <p>
              If xNotary disappears tomorrow, your certificates must still be provable — so nothing
              here is a proprietary format.
            </p>
            <ol>
              <li>Install the reference client: <code>pip install opentimestamps-client</code></li>
              <li>
                Detach <code>proof.ots</code> from the Certificate 1 PDF — or from a Certificate 2,
                which carries it too when the document itself was signed — using any reader with an
                attachments panel. Or use the <code>.ots</code> file you saved.
              </li>
              <li>Run <code>ots verify -f your-document.pdf proof.ots</code></li>
            </ol>
            <p>
              The client recomputes the digest itself and queries Bitcoin directly. It will print
              the block height and the attested time.
            </p>
          </div>
        </details>

        <details class="explain" id="q-no-official">
          <summary>How can evidence be trusted without an official witnessing it?</summary>
          <div>
            For timestamping, trust comes from a verifiable calculation linked to Bitcoin’s public
            history. No official needs to inspect or approve the file. For proving agreement,
            additional checks must reliably connect a person, their signing action and the exact
            document. Removing physical attendance does not remove the need for those checks.
          </div>
        </details>

        <details class="explain" id="q-stronger">
          <summary>Can xNotary provide stronger evidence than a signature on paper?</summary>
          <div>
            For detecting changes to a digital file and proving its existence in time, a verified
            cryptographic proof can provide stronger technical evidence than a handwritten signature
            and written date alone. It checks an exact digital fingerprint. Our goal is to combine
            that precision with trusted identity and verified signatures. Stronger technical
            evidence does not automatically mean greater legal authority.
          </div>
        </details>

        <details class="explain" id="q-email">
          <summary>Why should I trust xNotary rather than just keep an email?</summary>
          <div>
            Emails can be useful evidence of communication. xNotary adds a separate proof of the
            exact file’s existence that can be checked beyond one inbox or provider. Completed
            OpenTimestamps proofs use an open format and can be verified outside xNotary. The web
            verifier uses external Bitcoin data services; a compatible verifier using your own
            Bitcoin node offers greater independence.
          </div>
        </details>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">Privacy and keeping your evidence</h2>
      <div class="case-list">
        <details class="explain" id="q-keeps">
          <summary>What does xNotary keep?</summary>
          <div>
            <p>
              Nothing, anywhere — there is no xNotary backend to keep it on. xNotary is a static page
              that runs entirely in your browser.
            </p>
            <div class="review-box">
              <div class="review-row">
                <span>Your files</span>
                <div>
                  Never uploaded. They are hashed on this device and only the 32-byte digest is
                  sent, to the public OpenTimestamps calendars.
                </div>
              </div>
              <div class="review-row">
                <span>Certificate 2</span>
                <div>
                  Not stored at all, not even here. It is built in the tab and handed to you to
                  save. Close the tab and it is gone — though it can be rebuilt at any time from the
                  same signed files.
                </div>
              </div>
              <div class="review-row">
                <span>Certificate 1</span>
                <div>
                  The one exception, kept in this browser's own storage on this device, so that a
                  pending Bitcoin timestamp can be upgraded to confirmed later. It is not sent
                  anywhere, and you can delete it from <em>My certificates</em> whenever you like.
                </div>
              </div>
            </div>
            <p>
              This is the point of the design rather than a gap in it. A service that never holds
              your documents cannot leak them, cannot be compelled to hand them over, and cannot
              lose them.
            </p>
          </div>
        </details>

        <details class="explain" id="q-public">
          <summary>Will my document become public?</summary>
          <div>
            Timestamping does not publish your document on Bitcoin. Your browser calculates its
            fingerprint, and the timestamping process sends a cryptographic commitment rather than
            the document itself. Check what you share afterwards: an exported certificate may
            include the original PDF, including names and signatures. This is not anonymization — a
            signatory who does not appear in the app’s overview has not been removed from anything,
            and their details may still sit inside that attached PDF. If a document has to be shared
            without someone’s details, remove them before you timestamp it.
          </div>
        </details>

        <details class="explain" id="q-keep">
          <summary>What should I keep, and what happens if xNotary disappears?</summary>
          <div>
            Keep the exact original file and its completed OpenTimestamps proof, including the .ots
            file. Compatible tools can verify a completed standard proof without xNotary. A pending
            proof may still need calendar servers to complete it. A PDF certificate or screenshot
            alone is not a substitute for verification, and the proof cannot recover a lost original
            document. Do not treat <em>My certificates</em> as the place you keep them: that list
            lives in this browser under this address, xnotary.digital, and clearing your browser
            data or opening the app from a different address leaves it empty.
          </div>
        </details>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">Notaries and legal standing</h2>
      <div class="case-list">
        <details class="explain" id="q-visit">
          <summary>Do I need to visit a notary or government office?</summary>
          <div>
            No visit or official is needed to create and verify an xNotary timestamp. You can do it
            from your browser. Where a transaction requires an officially certified signature, a
            notarial deed or another prescribed form, the beta’s timestamp alone does not fulfil
            that requirement.
          </div>
        </details>

        <details class="explain" id="q-official">
          <summary>Does xNotary replace an officially certified signature?</summary>
          <div>
            <p>
              Not in the reviewed beta. Official signature certification connects an identified
              person to a signature they made or acknowledged. A timestamp connects a file to a time
              record. Replacing the practical need for an official requires reliable identity and
              signature verification; satisfying a legal certification requirement also depends on
              the country and transaction.
            </p>
            <p>
              Where a law requires a signature to be verified by an official — notarized — an
              electronic signature stands in for it only on that jurisdiction's own terms, and
              xNotary neither checks those terms nor certifies that they are met. Czechia is the
              worked example: § 6(2) of Act 12/2020 Sb. grants the right, but only where it can be
              verified <em>from population register data</em> that the qualified certificate belongs
              to the signer — a check requiring register access that a page running in your browser
              does not have. § 6(3) excludes some cases outright. See the
              <a href={DIA_SUBSTITUTION_URL} target="_blank" rel="noopener noreferrer">
                DIA methodology</a
              >.
            </p>
          </div>
        </details>

        <details class="explain" id="q-copy">
          <summary>Does xNotary replace a certified true copy?</summary>
          <div>
            For a digital original, fingerprint verification can establish that another file is an
            exact match, without someone visually comparing pages. That addresses a similar
            practical need, but it is not official copy certification, also called vidimation. The
            beta does not compare a paper original with a scan or certify that the scan faithfully
            reproduces it.
          </div>
        </details>

        <details class="explain" id="q-court">
          <summary>Can I use the proof in court?</summary>
          <div>
            It can support evidence about a file’s contents and existence in time. Its legal weight
            depends on the jurisdiction, the dispute and other evidence. A timestamp does not
            guarantee an outcome, establish someone’s agreement or replace the required legal form
            of a transaction.
          </div>
        </details>

        <details class="explain" id="q-trust-service">
          <summary>Is xNotary a qualified trust service or an online notary?</summary>
          <div>
            The reviewed beta provides Bitcoin-based timestamp evidence and collects qualified
            electronic signatures made with the parties’ own tools. That does not make it a
            qualified timestamping service, an official signature-certification service or a notary.
            Our direction is to make document evidence and agreement verifiable remotely; any claim
            of a particular legal status requires the corresponding requirements to be met.
          </div>
        </details>

        <details class="explain" id="q-borders">
          <summary>Can I use xNotary across borders?</summary>
          <div>
            You can create and verify timestamp proofs remotely from a suitable browser with an
            internet connection. No official needs to attend the timestamping process, wherever you
            are. The technical evidence can be checked across borders; legal requirements and
            recognition may differ between countries.
          </div>
        </details>
      </div>
    </div>

    <!--
      Examples, not features. Each one is here because it is the only place a
      particular property is shown concretely — the agreement check, the file
      never leaving the device, the recipient needing nothing, the limit on what
      a timestamp can mean, and a certificate outliving this app.
    -->
    <div class="single-card">
      <h2 class="section-title">What people use it for</h2>
      <div class="case-list">
        <details class="explain" id="q-uses">
          <summary>What would I use the beta for?</summary>
          <div>
            Keep evidence of a design before sharing it, a quotation before negotiations or a report
            before delivery. If someone disputes which version existed, you have a precise file and
            proof to verify. The beta is deliberately general rather than built for one industry or
            one document type — if you find a use we have not thought of, tell us. Evidence of
            delivery, acceptance or authorship must come from additional records or verified
            signatures.
          </div>
        </details>

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
  </div>
</section>
