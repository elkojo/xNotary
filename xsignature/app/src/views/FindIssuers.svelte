<!--
  Continuing a certificate chain that stops at the signer: one button that looks the issuer up
  in the directory this site serves, and — when it is not there, or the reader prefers — a file
  of their own. On Sign a document the click is the consent. On Check a signed file the lookup runs
  by itself (owner's decision, 2026-11-05) and only this file route is shown, when it finds nothing.

  What it fetches is one small file from this site (src/lib/document/certificate/read/directory.ts).
  The screen using this shows what was added; this only finds it.
-->
<script lang="ts">
  import type { Certificate } from 'pkijs';
  import Fresh from '../../../../app/src/site/Fresh.svelte';

  import Info from '../../../../app/src/site/Info.svelte';
  import { DirectoryUnreachable, findIssuers, siteDirectory } from '../lib/document/certificate/read/directory';

  interface Props {
    /** The certificate to continue from. */
    leaf: Certificate;
    /** Where the certificate says its issuer is published, if it says. */
    issuerUrl: string | null;
    /** Found in the directory: the chain, issuer first, and a sentence saying where from. */
    onfound: (chain: Certificate[], from: string) => void;
    /** A file the reader chose instead. */
    onfile: (file: File) => void;
    /** The directory was already asked and does not have it: only the file route is left. */
    alreadyMissed?: boolean;
  }

  let { leaf, issuerUrl, onfound, onfile, alreadyMissed = false }: Props = $props();

  let looking = $state(false);
  // svelte-ignore state_referenced_locally
  let missed = $state(alreadyMissed);
  let byFile = $state(false);
  let unreachable = $state(false);

  /** Trusted lists are named by territory; the EU writes Greece as EL. */
  const regions = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
  const country = (code: string) => regions?.of(code === 'EL' ? 'GR' : code) ?? code;

  async function find() {
    looking = true;
    missed = false;
    unreachable = false;
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
    } catch (error) {
      if (!(error instanceof DirectoryUnreachable)) throw error;
      unreachable = true;
    } finally {
      looking = false;
    }
  }
</script>

{#if !alreadyMissed}
<div class="action-group">
  <button class="button dark small" type="button" disabled={looking} onclick={() => void find()}>
    <Fresh text={looking ? 'Looking…' : 'Fetch from the issuer directory'} />
  </button>
  <Info label="About the issuer directory"
    >This site keeps a copy of every qualified issuer on the trusted lists of the EU, Switzerland and
    Ukraine — each qualified under its own framework. The click fetches one small part of it from this
    site — nothing about you or the document is sent — and a certificate is
    taken only if its key verifies the one below it. That it was on a trusted list is not checked
    here: that is the PDF reader's call.</Info
  >
  {#if !byFile && !missed}
    <button class="link-button" type="button" onclick={() => (byFile = true)}>or add it from a file</button>
  {/if}
</div>
{/if}

{#if unreachable}
  <div class="notice warn">
    <strong>Could not reach the issuer directory.</strong> Try again, or add the certificate from a file.
  </div>
{/if}

{#if missed}
  <div class="notice warn">
    <strong>Not in the directory</strong>, which holds qualified issuers from the trusted lists of the
    EU, Switzerland and Ukraine only.
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
      A <code translate="no">.pem</code>, <code translate="no">.crt</code> or <code translate="no">.p7b</code>. Read here; nothing is sent.
    </p>
  </div>
{/if}
