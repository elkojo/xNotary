<!--
  Continuing a certificate chain that stops at the signer: one button that looks the issuer up
  in the directory this site serves, and — when it is not there, or the reader prefers — a file
  of their own. The same on Sign a document and on Check a PDF.

  The click is the consent: nothing is fetched until it, and what it fetches is one small file
  from this site (src/lib/document/certificate/read/directory.ts). The screen using this shows
  what was added; this only finds it.
-->
<script lang="ts">
  import type { Certificate } from 'pkijs';

  import Info from '../../../../app/src/site/Info.svelte';
  import { findIssuers, siteDirectory } from '../lib/document/certificate/read/directory';

  interface Props {
    /** The certificate to continue from. */
    leaf: Certificate;
    /** Where the certificate says its issuer is published, if it says. */
    issuerUrl: string | null;
    /** Found in the directory: the chain, issuer first, and a sentence saying where from. */
    onfound: (chain: Certificate[], from: string) => void;
    /** A file the reader chose instead. */
    onfile: (file: File) => void;
  }

  let { leaf, issuerUrl, onfound, onfile }: Props = $props();

  let looking = $state(false);
  let missed = $state(false);
  let byFile = $state(false);

  /** Trusted lists are named by territory; the EU writes Greece as EL. */
  const regions = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
  const country = (code: string) => regions?.of(code === 'EL' ? 'GR' : code) ?? code;

  async function find() {
    looking = true;
    missed = false;
    try {
      const found = await findIssuers(leaf, siteDirectory(import.meta.env.BASE_URL));
      if (!found) {
        missed = true;
        return;
      }
      const lists = [...new Set(found.lists)].map(country);
      onfound(
        found.chain,
        `From ${lists.join(' and ')}'s trusted list, as read on ${found.asOf}.`,
      );
    } finally {
      looking = false;
    }
  }
</script>

<div class="action-group">
  <button class="button dark small" type="button" disabled={looking} onclick={() => void find()}>
    {looking ? 'Looking…' : 'Fetch from the issuer directory'}
  </button>
  <Info label="About the issuer directory"
    >This site keeps a copy of every qualified issuer on the EU's trusted lists. The click fetches one
    small part of it from this site — nothing about you or the document is sent — and a certificate is
    taken only if its key verifies the one below it. That it was on a trusted list is not checked
    here: that is the PDF reader's call.</Info
  >
  {#if !byFile && !missed}
    <button class="link-button" type="button" onclick={() => (byFile = true)}>or add it from a file</button>
  {/if}
</div>

{#if missed}
  <div class="notice warn">
    <strong>Not in the directory</strong>, which holds qualified issuers from the EU's trusted lists only.
    {#if issuerUrl}
      The certificate says this one is published at
      <!-- A link the reader follows, never a request this app makes. -->
      <a href={issuerUrl} target="_blank" rel="noopener noreferrer">{issuerUrl}</a>: download it
      and add it below.
    {:else}
      Download it from the authority that issued the certificate and add it below.
    {/if}
  </div>
{/if}

{#if missed || byFile}
  <div class="field">
    <span class="field-label">Issuer certificate file</span>
    <input
      class="input"
      type="file"
      accept=".pem,.crt,.cer,.der,.p7b,.p7c,application/x-x509-ca-cert,application/x-pkcs7-certificates"
      onchange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) onfile(file);
      }}
    />
    <p class="field-note">
      A <code>.pem</code>, <code>.crt</code> or <code>.p7b</code>. Read here; nothing is sent.
    </p>
  </div>
{/if}
