<script lang="ts">
  import type { View } from '../nav';

  interface Props {
    go: (view: View) => void;
  }
  let { go }: Props = $props();
</script>

<section class="home">
  <div class="home-wrap">
    <div class="hero">
      <div class="eyebrow">Independent document evidence</div>
      <h1>Make any document provable.</h1>
      <p>
        Create a portable record of what existed, when, and who signed it. Your document stays with
        you — it is read in this browser and never uploaded, because there is no server to upload it
        to.
      </p>
      <div class="hero-actions">
        <button class="button primary" onclick={() => go('notarize')}>
          Timestamp a document →
        </button>
        <button class="button secondary" onclick={() => go('verify')}>
          Check a certificate
        </button>
      </div>
    </div>

    <div class="service-grid">
      <button class="service-card" onclick={() => go('notarize')}>
        <span class="service-number">01</span>
        <span class="service-arrow" aria-hidden="true">↗</span>
        <h2>Timestamp</h2>
        <p>
          Prove that an exact file existed no later than a particular Bitcoin block. Only its
          32-byte fingerprint is ever sent.
        </p>
      </button>
      <button class="service-card" onclick={() => go('attest')}>
        <span class="service-number">02</span>
        <span class="service-arrow" aria-hidden="true">↗</span>
        <h2>Signatures</h2>
        <p>
          Sign in your own tool, with a provider you already trust, then bring the signed file back
          here to record who signed the exact document.
        </p>
      </button>
      <button class="service-card" onclick={() => go('verify')}>
        <span class="service-number">03</span>
        <span class="service-arrow" aria-hidden="true">↗</span>
        <h2>Verify</h2>
        <p>
          Check a document against its certificate and its Bitcoin anchor — here, or with the
          reference client and no xNotary at all.
        </p>
      </button>
    </div>

    <div class="trust-row">
      <span>No document upload</span>
      <span>No account</span>
      <span>No server</span>
      <span>Open verification</span>
    </div>

    <!--
      Direction, not capability. The wording has to survive a reader who arrives
      at it cold: nothing on this strip describes something the app does today,
      and it says so rather than relying on the tense to carry it.
    -->
    <div class="future-note">
      <p>
        <strong>Proof for people today. Verifiable authority for software tomorrow.</strong><br />
        The same evidence layer could carry remote multiparty agreements, and contracts between
        authorised software agents. That is where we intend to take it — not something xNotary does
        yet.
      </p>
      <span>Our direction</span>
    </div>
  </div>
</section>
