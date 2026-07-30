<script lang="ts">
  import { DSS_SOURCE_URL } from '../lib/certificate2';
  import { CALENDAR_URLS } from '../lib/ots';

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
</script>

<div class="card">
  <h2>What xNotary does</h2>
  <p class="hint">
    Two kinds of proof, in the order you would actually use them. Both work today. Step 2 happens
    outside xNotary — that is the point of it, not a gap.
  </p>
  <div class="rows" style="margin-top:1rem">
    <div class="row">
      <span>1 · Notarize</span>
      <span class="value">
        <strong>Certificate 1 — integrity and existence.</strong> This exact file existed no later
        than a particular Bitcoin block. Your file is hashed here and never leaves the device.
      </span>
    </div>
    <div class="row">
      <span>2 · Sign</span>
      <span class="value">
        <strong>With your own tools, not here.</strong> You and the other parties sign — ideally
        the document itself, otherwise its Certificate 1 — using signatures from a provider you
        already trust. xNotary never issues, holds or sees a signing key.
      </span>
    </div>
    <div class="row">
      <span>3 · Attest signatures</span>
      <span class="value">
        <strong>Certificate 2 — who signed.</strong> Drop in the signed files, confirm who may be
        named, and get a one-page PDF listing them with their issuing authority and signing time,
        the signed documents embedded inside it. Add the Certificate 1 or its
        <span class="mono">proof.ots</span> and it also establishes that the signatures are over
        the timestamped document itself.
      </span>
    </div>
    <div class="row">
      <span>4 · Verify integrity</span>
      <span class="value">
        <strong>For whoever receives it.</strong> Anyone holding the document and its Certificate 1
        can check two things here: that this file is the one the certificate is about, and that the
        timestamp is real. It does not check signatures — see <em>Not a validation result</em>
        below.
      </span>
    </div>
    <div class="row">
      <span>My certificates</span>
      <span class="value">
        The Certificate 1s made on this device, kept in this browser only so a pending timestamp
        can be upgraded to confirmed once Bitcoin catches up. Nothing else is stored, anywhere.
      </span>
    </div>
  </div>
</div>

<div class="card">
  <h2>How the timestamp works</h2>
  <p class="hint">
    Your file is hashed here, in your browser. Only the resulting 32-byte SHA-256 digest is sent —
    to public OpenTimestamps calendar servers, which batch many digests into a single Bitcoin
    transaction. The digest reveals nothing about the file's contents, and the file itself is never
    uploaded to anyone, including us. There is no “us”: xNotary has no backend.
  </p>
  <div class="rows" style="margin-top:1rem">
    <div class="row">
      <span>Calendars used</span>
      <span class="value">
        {#each CALENDAR_URLS as url}
          <div class="mono">{url.hostname}</div>
        {/each}
      </span>
    </div>
    <div class="row">
      <span>Pending</span>
      <span class="value">
        Right after stamping, a calendar has promised to anchor your digest but no Bitcoin block
        contains it yet. This is normal and usually resolves within a few hours.
      </span>
    </div>
    <div class="row">
      <span>Confirmed</span>
      <span class="value">
        Once anchored, the proof stands on its own: it can be checked against the Bitcoin blockchain
        by anyone, forever, with no calendar and no xNotary involved.
      </span>
    </div>
  </div>
</div>

<div class="card">
  <h2>Verifying without xNotary</h2>
  <p class="hint">
    This matters more than the app. If xNotary disappears tomorrow, your certificates must still be
    provable — so nothing here is a proprietary format.
  </p>
  <ol style="color:var(--muted);font-size:.9rem;line-height:1.7">
    <li>
      Install the reference client: <code>pip install opentimestamps-client</code>
    </li>
    <li>
      Detach <code>proof.ots</code> from the Certificate 1 PDF — or from a Certificate 2, which
      carries it too when the document itself was signed — using any reader with an attachments
      panel. Or use the <code>.ots</code> file you saved.
    </li>
    <li>
      Run <code>ots verify -f your-document.pdf proof.ots</code>
    </li>
  </ol>
  <p class="hint">
    The client recomputes the digest itself and queries Bitcoin directly. It will print the block
    height and the attested time.
  </p>
</div>

<div class="card">
  <h2>Getting a signature</h2>
  <p class="hint">
    Certificate 2 collects signatures made over the document, or over its Certificate 1. xNotary
    deliberately does not issue, hold, or broker signing keys — you bring your own signature, from
    a provider you already trust.
    Any PAdES signature can be read and attested, wherever it was issued. How much legal weight it
    carries is a question for the law that applies to you: most frameworks define a highest tier
    and a list of providers entitled to issue one.
  </p>
  <p class="hint">
    In the EU that tier is the qualified electronic signature (QES) under eIDAS — a qualified
    certificate on a qualified signature creation device, issued by a qualified trust service
    provider. In Czechia those providers are:
  </p>
  <div class="rows" style="margin-top:1rem">
    <div class="row">
      <span>I.CA</span>
      <span class="value"
        >První certifikační autorita — <a
          href="https://www.ica.cz/"
          target="_blank"
          rel="noopener noreferrer">ica.cz</a
        ></span
      >
    </div>
    <div class="row">
      <span>PostSignum</span>
      <span class="value"
        >Česká pošta — <a
          href="https://www.postsignum.cz/"
          target="_blank"
          rel="noopener noreferrer">postsignum.cz</a
        ></span
      >
    </div>
    <div class="row">
      <span>eIdentity</span>
      <span class="value"
        >eIdentity a.s. — <a
          href="https://www.eidentity.cz/"
          target="_blank"
          rel="noopener noreferrer">eidentity.cz</a
        ></span
      >
    </div>
  </div>
  <p class="hint" style="margin-top:1rem">
    Outside the EU, use whatever your own framework recognises: xNotary reads the signature the
    same way either way, and names the authority that issued it. You sign with the tool your
    provider gives you — the document itself for preference, otherwise its Certificate 1 — then
    send the signed PDF back to whoever is assembling Certificate 2. Your private key never
    touches xNotary.
  </p>
</div>

<div class="card">
  <h2>Bank iD SIGN is not a qualified signature</h2>
  <div class="notice warn">
    Bank iD SIGN does <strong>not</strong> produce a qualified electronic signature. It is listed
    here separately because it is often assumed to.
  </div>
  <p class="hint">
    Bank iD is an identity scheme, not a signing certificate: your bank confirms who you are, and
    the document is then sealed with Bank iD's own qualified electronic <em>seal</em>. What the
    signer ends up with is an advanced electronic signature — <em>zaručený elektronický podpis</em>
    — carrying strong identity evidence, but not the qualified status that only a qualified
    certificate on a qualified device confers. The difference is legal, not cosmetic: where a law,
    an authority, or a counterparty requires a QES, Bank iD SIGN will not satisfy it.
  </p>
  <p class="hint">
    xNotary accepts it all the same. Certificate 2 records the signature and reports what its
    certificate claims — it never upgrades an advanced signature into a qualified one, and it never
    states that any signature is qualified. Validate the certificate the way every Certificate 2
    describes, to find out which of the two you are holding.
  </p>
</div>

<div class="card">
  <h2>What xNotary keeps</h2>
  <p>
    Nothing, on any server — because there is no server. xNotary is a static page that runs
    entirely in your browser; there is nowhere for it to put your documents even if it wanted to.
  </p>
  <ul>
    <li>
      <strong>Your files</strong> are never uploaded. They are hashed on this device and only the
      32-byte digest is sent, to the public OpenTimestamps calendars.
    </li>
    <li>
      <strong>Certificate 2</strong> is not stored at all, not even here. It is built in the tab
      and handed to you to save. Close the tab and it is gone — so save it somewhere you back up.
      Nothing is lost if you forget: it can be rebuilt at any time from the same signed files.
    </li>
    <li>
      <strong>Certificate 1</strong> is the one exception, kept in this browser's own storage on
      this device, so that a pending Bitcoin timestamp can be upgraded to confirmed later. It is
      not sent anywhere, and you can delete it from <em>My certificates</em> whenever you like.
      Clearing your browser data removes it too — keep the downloaded PDF as your real copy.
    </li>
  </ul>
  <p>
    This is the point of the design rather than a gap in it. A service that never holds your
    documents cannot leak them, cannot be compelled to hand them over, and cannot lose them.
  </p>

  <h2>Limits you should know about</h2>
  <div class="rows">
    <div class="row">
      <span>Not a signature</span>
      <span class="value">
        Certificate 1 proves a file existed at a time. It says nothing about who made it or what it
        means. Certificate 2 records who signed, and what they signed: the document itself when the
        proof links the two, otherwise its Certificate 1 — which is not the same thing, and the
        certificate says which of them it is.
      </span>
    </div>
    <div class="row">
      <span>Not a validation result</span>
      <span class="value">
        Certificate 2 reports what each signature and its certificate <em>claim</em>. xNotary can
        check integrity and read certificate data, but it does not check those certificates against
        any trust list, so it never states what legal status a signature has. This matters wherever
        you are: a law that treats an electronic signature as equivalent to a handwritten one makes
        that equivalence conditional on the signature actually meeting the conditions. In the EU
        that is the QES under eIDAS — see the Commission's
        <a href={ESIGNATURE_FAQ_URL} target="_blank" rel="noopener noreferrer">eSignature FAQ</a>.
        Every Certificate 2 prints how to get that determination from something that can give it:
        <a href={DSS_SOURCE_URL} target="_blank" rel="noopener noreferrer">DSS</a> run on your own
        machine, or a validation service from a trust provider.
      </span>
    </div>
    <div class="row">
      <span>Not an officially verified signature</span>
      <span class="value">
        Where a law requires a signature to be verified by an official — notarized — an electronic
        signature stands in for it only on that jurisdiction's own terms, and xNotary neither
        checks those terms nor certifies that they are met. Czechia is the worked example: § 6(2)
        of Act 12/2020 Sb. grants the right, but only where it can be verified <em>from population
          register data</em> that the qualified certificate belongs to the signer — a check
        requiring register access that a page running in your browser does not have. § 6(3)
        excludes some cases outright. See the
        <a href={DIA_SUBSTITUTION_URL} target="_blank" rel="noopener noreferrer">DIA methodology</a
        >.
      </span>
    </div>
    <div class="row">
      <span>Not an accredited timestamp</span>
      <span class="value">
        The Bitcoin anchor is strong evidence, and it is checkable by anyone anywhere without
        trusting a provider — but it is not a timestamp from an accredited trust service, which in
        the EU means a qualified electronic timestamp under eIDAS. Support for an RFC 3161
        timestamp alongside it is the first post-MVP milestone.
      </span>
    </div>
    <div class="row">
      <span>No long-term validation</span>
      <span class="value">
        xNotary does not yet embed PAdES-LTA/LTV data. Certificates and revocation information can
        expire; signers' own tools often add this.
      </span>
    </div>
    <div class="row">
      <span>Nothing is backed up</span>
      <span class="value">
        Self-custody cuts both ways. Clear your browser data and your library is gone. Export your
        certificates.
      </span>
    </div>
  </div>
</div>
