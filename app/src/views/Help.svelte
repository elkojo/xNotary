<script lang="ts">
  import { CALENDAR_URLS } from '../lib/ots';
</script>

<div class="card">
  <h2>What xNotary does</h2>
  <p class="hint">
    xNotary produces two kinds of proof. This MVP ships the first one and prepares the second.
  </p>
  <div class="rows" style="margin-top:1rem">
    <div class="row">
      <span>Certificate 1</span>
      <span class="value">
        <strong>Integrity + existence.</strong> This exact file existed no later than a particular Bitcoin
        block. Available now.
      </span>
    </div>
    <div class="row">
      <span>Certificate 2</span>
      <span class="value">
        <strong>Attestation.</strong> Identified people applied their qualified electronic signatures
        to Certificate 1. Coming in the next milestone.
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
      Detach <code>proof.ots</code> from the Certificate 1 PDF (any reader with an attachments
      panel), or use the <code>.ots</code> file you saved.
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
  <h2>Getting a qualified electronic signature (eIDAS QES)</h2>
  <p class="hint">
    Certificate 2 will collect qualified signatures over Certificate 1. xNotary deliberately does
    not issue, hold, or broker signing keys — you bring your own signature, from a provider you
    already trust. In Czechia the qualified trust service providers are:
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
    <div class="row">
      <span>Bank iD</span>
      <span class="value">
        Several Czech banks offer qualified signing through their own interface, using the identity
        they already verified for you.
      </span>
    </div>
  </div>
  <p class="hint" style="margin-top:1rem">
    You sign the Certificate 1 PDF with the tool your provider gives you, then send the signed PDF
    back to whoever is assembling Certificate 2. Your private key never touches xNotary.
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
        means. Certificate 2 will prove that identified people attested to Certificate 1 — which is
        not the same as signing the underlying document.
      </span>
    </div>
    <div class="row">
      <span>Not a qualified timestamp</span>
      <span class="value">
        The Bitcoin anchor is strong evidence, but it is not a qualified electronic timestamp under
        eIDAS. Support for a qualified RFC 3161 timestamp alongside it is the first post-MVP
        milestone.
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
