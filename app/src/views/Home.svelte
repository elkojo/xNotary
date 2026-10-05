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
      <p>Prove what existed, when, and who signed it. Your document never leaves this browser.</p>
      <div class="hero-actions">
        <button class="button primary" onclick={() => go('notarize')}>
          Timestamp a document →
        </button>
        <button class="button secondary" onclick={() => go('verify')}>
          Verify a proof
        </button>
      </div>
    </div>

    <div class="service-grid">
      <button class="service-card" onclick={() => go('notarize')}>
        <span class="service-number">01</span>
        <span class="service-arrow" aria-hidden="true">↗</span>
        <h2>Timestamp</h2>
        <p>Prove an exact file existed by a given Bitcoin block.</p>
      </button>
      <button class="service-card" onclick={() => go('attest')}>
        <span class="service-number">02</span>
        <span class="service-arrow" aria-hidden="true">↗</span>
        <h2>Certify signers</h2>
        <p>Record who signed, from files signed in your own tool.</p>
      </button>
      <button class="service-card" onclick={() => go('verify')}>
        <span class="service-number">03</span>
        <span class="service-arrow" aria-hidden="true">↗</span>
        <h2>Verify proof</h2>
        <p>Check a document against its certificate — here or without xNotary.</p>
      </button>
    </div>

    <div class="trust-row">
      <span>No document upload</span>
      <span>No account</span>
      <span>No xNotary backend</span>
      <span>Open verification</span>
    </div>
  </div>
</section>
