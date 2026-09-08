<!--
  The questions people actually ask, answered in the same words everywhere else
  answers them: what the beta proves, and — more often the point — what it does
  not. Grouped and folded because twenty-one open answers would bury the page.
  No links and no call to action here on purpose: this screen answers, it does
  not sell. "How it works" is where the sources and the walkthrough live.
-->
<section class="product-view">
  <div class="workspace">
    <div class="page-head">
      <div>
        <h1>Questions and answers</h1>
        <p>
          What xNotary is, what the beta can and cannot prove, and where an official is still
          required.
        </p>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">What xNotary is</h2>

      <div class="case-list">
        <details class="explain">
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

        <details class="explain">
          <summary>What does xNotary cost, and what does it keep?</summary>
          <div>
            Nothing, and nothing. xNotary is free and open source. There are no accounts, no backend
            and no upload: everything runs in your browser, your file never leaves your device, and
            only its fingerprint is sent to be timestamped. There is no server holding your
            documents, no charge per document and no transaction fees — your fingerprint is
            aggregated with many others before it reaches Bitcoin, which is why timestamping costs
            nothing.
          </div>
        </details>

        <details class="explain">
          <summary>What can the beta prove today?</summary>
          <div>
            The reviewed beta creates and verifies timestamp proofs, and assembles qualified
            electronic signatures made over them. A completed and verified proof — Certificate 1 —
            supports that the exact file existed before the relevant Bitcoin block, and lets you
            check whether a file matches it. Where the parties sign with qualified certificates of
            their own, the app collects those signatures into Certificate 2, a record that
            identified persons attested to Certificate 1. It reads those signatures rather than
            validating them against official trust lists, so it reports what they claim rather than
            confirming it.
          </div>
        </details>

        <details class="explain">
          <summary>How does it work?</summary>
          <div>
            Your browser calculates a digital fingerprint of your file. OpenTimestamps links that
            fingerprint to a record in Bitcoin. Verification recalculates the fingerprint and checks
            the connection. Even a tiny change to the file produces a different fingerprint, so the
            changed file will not match the original proof.
          </div>
        </details>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">Notaries and legal standing</h2>

      <div class="case-list">
        <details class="explain">
          <summary>Do I need to visit a notary or government office?</summary>
          <div>
            No visit or official is needed to create and verify an xNotary timestamp. You can do it
            from your browser. Where a transaction requires an officially certified signature, a
            notarial deed or another prescribed form, the beta’s timestamp alone does not fulfil
            that requirement.
          </div>
        </details>

        <details class="explain">
          <summary>Does xNotary replace an officially certified signature?</summary>
          <div>
            Not in the reviewed beta. Official signature certification connects an identified person
            to a signature they made or acknowledged. A timestamp connects a file to a time record.
            Replacing the practical need for an official requires reliable identity and signature
            verification; satisfying a legal certification requirement also depends on the country
            and transaction.
          </div>
        </details>

        <details class="explain">
          <summary>Does xNotary replace a certified true copy?</summary>
          <div>
            For a digital original, fingerprint verification can establish that another file is an
            exact match, without someone visually comparing pages. That addresses a similar
            practical need, but it is not official copy certification, also called vidimation. The
            beta does not compare a paper original with a scan or certify that the scan faithfully
            reproduces it.
          </div>
        </details>

        <details class="explain">
          <summary>Can I use the proof in court?</summary>
          <div>
            It can support evidence about a file’s contents and existence in time. Its legal weight
            depends on the jurisdiction, the dispute and other evidence. A timestamp does not
            guarantee an outcome, establish someone’s agreement or replace the required legal form
            of a transaction.
          </div>
        </details>

        <details class="explain">
          <summary>Is xNotary a qualified trust service or an online notary?</summary>
          <div>
            The reviewed beta provides Bitcoin-based timestamp evidence and collects qualified
            electronic signatures made with the parties’ own tools. That does not make it a
            qualified timestamping service, an official signature-certification service or a notary.
            Our direction is to make document evidence and agreement verifiable remotely; any claim
            of a particular legal status requires the corresponding requirements to be met.
          </div>
        </details>

        <details class="explain">
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

    <div class="single-card">
      <h2 class="section-title">What the evidence proves</h2>

      <div class="case-list">
        <details class="explain">
          <summary>Can xNotary provide stronger evidence than a signature on paper?</summary>
          <div>
            For detecting changes to a digital file and proving its existence in time, a verified
            cryptographic proof can provide stronger technical evidence than a handwritten signature
            and written date alone. It checks an exact digital fingerprint. Our goal is to combine
            that precision with trusted identity and verified signatures. Stronger technical
            evidence does not automatically mean greater legal authority.
          </div>
        </details>

        <details class="explain">
          <summary>Does the name shown in the signature viewer prove who signed?</summary>
          <div>
            No. In the reviewed beta, the viewer extracts signature information but does not
            cryptographically verify the signature itself. A displayed name is therefore not a
            verified identity. Checking that a document’s contents match a recorded fingerprint is a
            separate check from authenticating its signer.
          </div>
        </details>

        <details class="explain">
          <summary>How can evidence be trusted without an official witnessing it?</summary>
          <div>
            For timestamping, trust comes from a verifiable calculation linked to Bitcoin’s public
            history. No official needs to inspect or approve the file. For proving agreement,
            additional checks must reliably connect a person, their signing action and the exact
            document. Removing physical attendance does not remove the need for those checks.
          </div>
        </details>

        <details class="explain">
          <summary>Can someone timestamp a fake document or backdate it?</summary>
          <div>
            A false statement, copied work or AI-generated image can be timestamped. The proof
            establishes that file’s existence, not its truth or ownership. Changing a computer’s
            clock cannot create a valid proof linking a newly created file to an earlier Bitcoin
            block. Changing a timestamped file breaks its match with the original proof.
          </div>
        </details>

        <details class="explain">
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
      <h2 class="section-title">Using it</h2>

      <div class="case-list">
        <details class="explain">
          <summary>Can I use xNotary to sign a contract with someone?</summary>
          <div>
            Yes, using the qualified electronic signature you already have. Each party verifies the
            document against Certificate 1, signs with their own qualified certificate — from a
            qualified provider or, where offered, their bank — and the app assembles the collected
            signatures into Certificate 2. Two limits apply: those signatures cover Certificate 1
            rather than the contract itself, so this is an attestation rather than a signature of
            the underlying document; and the app reads the signatures without validating them
            against official trust lists, so authoritative validation means an external validator.
          </div>
        </details>

        <details class="explain">
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
          <summary>Why does my proof say “Pending anchor”?</summary>
          <div>
            The request has been accepted, but its Bitcoin proof is not complete yet. Anchoring
            waits for at least one Bitcoin block and often several, so expect anywhere from about
            twenty minutes to a few hours. Save the pending proof, return later and use Upgrade,
            then verify and save the completed version. The proof establishes existence before the
            relevant Bitcoin block, not the exact moment you created or signed the document.
          </div>
        </details>

        <details class="explain">
          <summary>Do I need bitcoin or a crypto wallet?</summary>
          <div>
            No. The beta’s timestamping process does not require you to buy bitcoin or connect a
            wallet. Bitcoin supplies the public record used for verification. A change in its market
            price does not itself change your file or erase its proof.
          </div>
        </details>
      </div>
    </div>

    <div class="single-card">
      <h2 class="section-title">Privacy and keeping your evidence</h2>

      <div class="case-list">
        <details class="explain">
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

        <details class="explain">
          <summary>What should I keep, and what happens if xNotary disappears?</summary>
          <div>
            Keep the exact original file and its completed OpenTimestamps proof, including the .ots
            file. Compatible tools can verify a completed standard proof without xNotary. A pending
            proof may still need calendar servers to complete it. A PDF certificate or screenshot
            alone is not a substitute for verification, and the proof cannot recover a lost original
            document.
          </div>
        </details>
      </div>
    </div>
  </div>
</section>
