<!--
  What a signature's certificate lets a reader say, the same for a PDF and a container: whether
  it brings the certificates above it, what a trusted list says, its revocation, its level, its
  timestamp, and what stays unchecked.

  When it appears it looks up the issuer, confirms this is the newest copy of the list, and reads
  the revocation list, all by itself (owner's decision, 2026-11-05): small files from this site,
  carrying nothing from the reader. What it found goes when it goes.
-->
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { Certificate } from 'pkijs';

  import Fresh from '../../../../app/src/site/Fresh.svelte';
  import Info from '../../../../app/src/site/Info.svelte';
  import SignatureLevel from '../../../../app/src/site/SignatureLevel.svelte';
  import {
    checkLinks,
    orderChain,
    readCertificates,
    type ChainLink,
  } from '../lib/document/certificate/read/chain';
  import {
    DirectoryUnreachable,
    findIssuers,
    siteDirectory,
    type DirectoryIndex,
    type FoundIssuers,
  } from '../lib/document/certificate/read/directory';
  import { revocationOf, type RevocationAnswer } from '../lib/document/verify/asic/revocation';
  import { fetchCrlCopy } from '../lib/document/verify/crl-copy';
  import { printable } from '../lib/document/verify/printable';
  import type { AttachedTimestamp, SignerFacts } from '../lib/document/verify/signer';
  import { checkAgainstList, confirmedTimeAuthority, factsOf, type ListStanding } from '../lib/document/verify/trust';
  import FindIssuers from './FindIssuers.svelte';

  interface Props {
    signature: SignerFacts & { readonly timestamp: AttachedTimestamp | null; readonly timestamps: readonly AttachedTimestamp[] };
    /** The signer's own stated time, used only when nothing better dates the signature. */
    signerClock?: Date | null;
    /**
     * An answer the signature carried, which the screen shows itself. Null when it was looked for
     * and there is none; left out where nothing looks, as for a PDF, so nothing is claimed.
     */
    carriedRevocation?: RevocationAnswer | null;
    /** Its own verdict is intact. Nothing about the certificate is green on a signature that is not. */
    holds: boolean;
    /** A timestamp rather than a signature of identity: no chain and no level to speak of. */
    isTimestamp: boolean;
    /** Who decides whether a signer can be believed: "your PDF reader", say. */
    judge: string;
    /** How the "Not checked" line ends. */
    goTo: string;
    /** Findings particular to this kind of file, before the limit. */
    children?: Snippet;
    /** A further sentence for the limit's bubble. */
    limits?: Snippet;
  }

  let { signature, signerClock = null, carriedRevocation = undefined, holds, isTimestamp, judge, goTo, children, limits }: Props = $props();

  const UTC = (time: Date): string => `${time.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')} UTC`;
  const day = (text: string): string => text.slice(0, 10);

  /** Trusted lists are named by territory; the EU writes Greece as EL. */
  const regions = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
  const country = (code: string) => regions?.of(code === 'EL' ? 'GR' : code) ?? code;

  let found = $state<FoundIssuers | null>(null);
  let index = $state<DirectoryIndex | null>(null);
  let lookedUp = $state(false);
  /** This site's directory could not be read, which says nothing about the issuer. */
  let lookupFailed = $state(false);
  let refreshing = $state(false);
  /** What pressing the update button came to. */
  let refreshed = $state('');
  /** The reader asked, and this is the newest copy there is. */
  let confirmedCurrent = $state(false);

  /**
   * Issuer certificates the reader went and fetched, when the directory did not have them.
   *
   * Those addresses are plain http, which a page served over https may not fetch, and they answer
   * no CORS preflight either. Both are the browser's rules, not this app's policy. So the reader
   * fetches it and drops it in, and the arithmetic happens here, offline.
   */
  let supplied = $state<{ name: string; links: ChainLink[]; error: string; first: Certificate | null } | null>(null);

  async function look(cache: RequestCache = 'default') {
    const leaf = signature.certificate;
    if (!leaf || isTimestamp) return;
    const source = siteDirectory(import.meta.env.BASE_URL, cache);
    try {
      const [issuers, facts] = await Promise.all([findIssuers(leaf, source), source('index') as Promise<DirectoryIndex | null>]);
      found = issuers;
      index = facts;
      lookupFailed = false;
    } catch (error) {
      if (!(error instanceof DirectoryUnreachable)) throw error;
      lookupFailed = true;
    }
    lookedUp = true;
  }

  /** Past any cache, so that "the newest copy" is true when it is said. */
  async function lookAndConfirm(cache: RequestCache) {
    await Promise.all([look(cache), lookTimeAuthority(cache)]);
    if (!lookupFailed && index) {
      confirmedCurrent = true;
      refreshed = 'This is the newest copy this site has.';
    }
  }

  onMount(() => void lookAndConfirm('no-cache'));

  /**
   * Fetch this site's copy again, past any cache.
   *
   * Only this site's copy: the lists themselves send no CORS header, so no page can read them
   * directly, and the button must not suggest it did. The copy is as new as the last time the
   * site read them.
   */
  async function refresh() {
    const before = index?.asOf;
    refreshing = true;
    refreshed = '';
    try {
      await Promise.all([look('reload'), lookTimeAuthority('reload')]);
      if (lookupFailed) {
        confirmedCurrent = false;
        refreshed = '';
        return;
      }
      refreshed = index?.asOf && index.asOf !== before ? `Updated to the copy read on ${index.asOf}.` : 'This is the newest copy this site has.';
      confirmedCurrent = true;
    } finally {
      refreshing = false;
    }
  }

  const foundLinks = $state<{ links: ChainLink[] }>({ links: [] });
  $effect(() => {
    const leaf = signature.certificate;
    const chain = found?.chain;
    if (!leaf || !chain) return;
    void checkLinks(leaf, chain).then((links) => (foundLinks.links = links));
  });

  async function takeIssuers(file: File | undefined) {
    if (!file) return;

    const leaf = signature.certificate;
    if (!leaf) {
      supplied = { name: file.name, links: [], first: null, error: 'This signature carries no readable certificate to continue from.' };
      return;
    }

    const read = readCertificates(new Uint8Array(await file.arrayBuffer()));
    if (read.length === 0) {
      supplied = {
        name: file.name,
        links: [],
        first: null,
        error: 'No certificate could be read from that file. The .crt an authority publishes, or a .pem bundle, will work.',
      };
      return;
    }

    const ordered = orderChain(leaf, read);
    if (ordered.length === 0) {
      supplied = {
        name: file.name,
        links: [],
        first: null,
        error: 'None of the certificates in that file signed this one, so they do not continue this chain. It may be for a different authority.',
      };
      return;
    }

    supplied = { name: file.name, links: await checkLinks(leaf, ordered), first: ordered[0], error: '' };
  }

  /**
   * Whether the timestamp's authority is on a verified list, granted at the time it states.
   *
   * A token that verifies only shows the certificate inside it made it, and anybody can make one
   * and write any date. So only a listed authority's time is independent, and everything that
   * depends on when the signature was made depends on this.
   */
  let timeAuthority = $state<{ list: string; stamp: AttachedTimestamp } | null>(null);

  /** Of however many it carries, one from a listed authority. Anybody can add others. */
  async function lookTimeAuthority(cache: RequestCache) {
    const source = siteDirectory(import.meta.env.BASE_URL, cache);
    let found: { list: string; stamp: AttachedTimestamp } | null = null;
    for (const stamp of signature.timestamps) {
      if (!stamp.certificate || stamp.standing !== 'holds') continue;
      try {
        const list = await confirmedTimeAuthority(stamp.certificate, stamp.time, source);
        if (list) {
          found = { list, stamp };
          break;
        }
      } catch (error) {
        if (!(error instanceof DirectoryUnreachable)) throw error;
        lookupFailed = true;
      }
    }
    timeAuthority = found;
  }

  /** The timestamp this screen goes by: a listed authority's if there is one. */
  const stampShown = $derived(timeAuthority?.stamp ?? signature.timestamp);

  /** What dates this signature, and how far that can be taken. */
  const moment = $derived.by((): { time: Date; independent: boolean } | null => {
    if (timeAuthority) return { time: timeAuthority.stamp.time, independent: true };
    // An unlisted token may have been added by anyone, so it never displaces what was signed.
    if (signerClock) return { time: signerClock, independent: false };
    const stamp = signature.timestamps.find((candidate) => candidate.standing === 'holds');
    return stamp ? { time: stamp.time, independent: false } : null;
  });

  const listed = $derived(found?.listed ?? null);

  const standing = $derived.by((): ListStanding | null => {
    const leaf = signature.certificate;
    const claims = signature.claims;
    if (!leaf || !claims || !listed || !moment) return null;
    return checkAgainstList(listed.services, listed.list, factsOf(leaf, claims, claims.types), moment.time);
  });

  /** The list's own dates, and whether this copy has outlived them. */
  const listFacts = $derived(listed ? (index?.verified?.[listed.list] ?? null) : null);
  const listOverdue = $derived(listFacts?.next ? new Date(listFacts.next).getTime() < Date.now() : false);

  const validWhenUsed = $derived.by(() => {
    const leaf = signature.certificate;
    if (!leaf || !moment) return true;
    const at = moment.time.getTime();
    return leaf.notBefore.value.getTime() <= at && at <= leaf.notAfter.value.getTime();
  });

  const shownLevel = $derived.by(() => {
    const claims = signature.claims;
    if (!claims) return { qualified: false, onQualifiedDevice: false };
    // Null means the list did not settle it, and that is not an invitation to take the certificate's word.
    if (standing?.result === 'qualified') return { qualified: true, onQualifiedDevice: standing.onQualifiedDevice === true };
    if (standing?.result === 'not-qualified') return { qualified: false, onQualifiedDevice: false };
    return { qualified: claims.qualified, onQualifiedDevice: claims.onQualifiedDevice };
  });

  // --- A revocation list the reader brings -------------------------------------------------

  /** The certificate that issued the signer's, on evidence: its key verified the signer's. */
  const issuerCertificate = $derived.by((): Certificate | null => {
    if (found?.chain[0]) return found.chain[0];
    if (supplied?.first && supplied.links[0]?.holds) return supplied.first;
    if (signature.issuers[0] && signature.chain[0]?.holds) return signature.issuers[0];
    return null;
  });

  let listFile = $state<{ answer: RevocationAnswer | null; error: string } | null>(null);
  let fetching = $state(false);
  /** There is no copy, or it is too old: only then is the reader asked to bring a file. */
  let offerFile = $state(false);
  /** The copy could not be asked for, so the button comes back. */
  let fetchFailed = $state(false);
  let fetchTried = false;

  async function readRevocationList(bytes: Uint8Array) {
    const leaf = signature.certificate;
    const issuer = issuerCertificate;
    if (!leaf || !issuer) return;
    const answer = await revocationOf(leaf, [issuer], { ocsp: [], crl: [bytes] });
    listFile = {
      answer,
      error: answer ? '' : 'That list comes from a different authority than the one that issued this certificate.',
    };
    if (!clearedByList && answer?.status !== 'revoked') offerFile = true;
  }

  /** This site's copy of the list the certificate names. Never the authority itself: no page can. */
  async function fetchRevocationList() {
    fetching = true;
    fetchFailed = false;
    try {
      const copy = await fetchCrlCopy(import.meta.env.BASE_URL, signature.claims?.crlUrls ?? []);
      if (copy === 'unreachable') {
        fetchFailed = true;
      } else if (copy === 'absent') {
        listFile = {
          answer: null,
          error: signature.claims?.crlUrls.length
            ? "This site has no copy of this authority's revocation list."
            : 'This certificate names no revocation list.',
        };
        offerFile = true;
      } else {
        await readRevocationList(copy);
      }
    } finally {
      fetching = false;
    }
  }

  async function takeRevocationList(file: File | undefined) {
    if (file) await readRevocationList(new Uint8Array(await file.arrayBuffer()));
  }

  /**
   * Why a list that does not name this certificate still proves nothing here. Null when it does
   * prove it: the issuer's key made it, only the issuer holds that key, and it was made after a
   * time somebody independent confirmed.
   */
  const listShortfall = $derived.by((): string | null => {
    const answer = listFile?.answer;
    const leaf = signature.certificate;
    if (!answer || !leaf || answer.standing !== 'holds' || answer.status !== 'good' || !answer.at) return null;
    if (!moment?.independent) return 'Nothing independent dates this signature, so the list cannot speak for when it was made.';
    if (answer.at.getTime() < moment.time.getTime()) return `The list is older than the signature: it was issued ${UTC(answer.at)}.`;
    if (answer.at.getTime() > leaf.notAfter.value.getTime() && !answer.keepsExpired) {
      return 'The list is from after this certificate expired, and an authority may drop expired certificates from its lists.';
    }
    return '';
  });
  const clearedByList = $derived(listShortfall === '');

  // Nothing carried settles it, either way: anyone can add an answer, including a forged "revoked"
  // against somebody else's good signature. The issuer's own list is always read.
  const offerRevocationList = $derived(!isTimestamp && !!signature.certificate);

  $effect(() => {
    if (fetchTried || !offerRevocationList || !issuerCertificate) return;
    fetchTried = true;
    void fetchRevocationList();
  });

  /** An answer says this certificate was revoked, which no green may sit beside. */
  const knownRevoked = $derived(
    (listFile?.answer?.standing === 'holds' && listFile.answer.status === 'revoked') ||
      // The issuer's own list outranks an answer anyone could have added.
      (carriedRevocation?.standing === 'holds' && carriedRevocation.status === 'revoked' && !clearedByList),
  );
  const listBacksIt = $derived(holds && standing?.result === 'qualified' && moment?.independent === true && validWhenUsed && !knownRevoked);
  /**
   * Green only when all of it holds: the list backs this certificate, at a time an authority dated,
   * the reader has confirmed this is the newest copy, and that copy has not outlived its list.
   */
  const levelConfirmed = $derived(listBacksIt && confirmedCurrent && !listOverdue && standing?.onQualifiedDevice !== null);
</script>

{#if lookupFailed}
  <div class="notice warn">
    <strong>Could not reach this site's copy of the trusted lists.</strong>
    So the issuer and the list were not checked, which says nothing against them.
    <span class="action-group list-update">
      <button class="button dark small" type="button" onclick={() => void lookAndConfirm('reload')}>Try again</button>
    </span>
  </div>
{/if}

{#if !isTimestamp && signature.certificate}
  <!--
    Whether the signature brought the certificates a reader needs to
    trace it. This is the half the recipient cares about, and the
    half a leaf-only key file leaves out.
  -->
  {#if signature.chain.length > 0}
    <div class="notice ok">
      <strong>It carries the certificates above it.</strong>
      <span class="outgoing-list">
        {#each signature.chain as link}
          <span>
            {link.holds ? '✓' : '✗'}
            <strong translate="no">{link.subject}</strong> signed by <strong translate="no">{link.issuer}</strong>
            {link.holds ? '' : ' — but that signature does not hold'}
          </span>
        {/each}
      </span>
      Each checked against the next — arithmetic only.
    </div>
  {:else}
    <!--
      Amber until something has continued the chain below, then gone. What it says stays true
      of the file, but the next line says that, and a warning above a green result reads as
      unresolved when it is not.
    -->
    {#if found}
      <div class="notice ok">
        <strong>This site's copy of {country(found.lists[0])}'s trusted list continues this chain.</strong>
        <span class="outgoing-list">
          {#each foundLinks.links as link}
            <span>
              {link.holds ? '✓' : '✗'}
              <strong translate="no">{link.subject}</strong> signed by <strong translate="no">{link.issuer}</strong>
              {link.holds ? '' : ' — but that signature does not hold'}
            </span>
          {/each}
        </span>
        Checked link by link.<Info
          >The file itself carries only the signer's certificate, so another reader may have to do this
          too. Nothing was written back.</Info
        >
      </div>
    {:else if supplied?.links.length}
      <div class="notice ok">
        <strong><span translate="no">{printable(supplied.name)}</span> continues this chain.</strong>
        <span class="outgoing-list">
          {#each supplied.links as link}
            <span>
              {link.holds ? '✓' : '✗'}
              <strong translate="no">{link.subject}</strong> signed by <strong translate="no">{link.issuer}</strong>
              {link.holds ? '' : ' — but that signature does not hold'}
            </span>
          {/each}
        </span>
        Checked link by link.<Info
          >The file itself carries only the signer's certificate, so another reader may have to do this
          too. Nothing was written back.</Info
        >
      </div>
    {:else if lookedUp && !lookupFailed}
      <div class="notice warn">
        <strong>This signature carries no issuer certificates.</strong>
        Only the signer's own, which names its issuer:
        <strong translate="no">{signature.issuedBy ?? 'not by any name it gives'}</strong>.<Info
          >Most readers hold a well-known authority already, and an online one fetches it
          by itself — which is why this often validates elsewhere without complaint. A
          reader that does neither has a name and no way to trace it.</Info
        >
      </div>
      <FindIssuers
        leaf={signature.certificate}
        issuerUrl={signature.claims?.issuerUrl ?? null}
        alreadyMissed
        onfound={() => undefined}
        onfile={(file) => void takeIssuers(file)}
      />
      {#if supplied?.error}
        <div class="notice bad">{supplied.error}</div>
      {/if}
    {/if}
  {/if}
{/if}

{#if !isTimestamp && signature.certificate && !validWhenUsed}
  <div class="notice" class:bad={moment?.independent} class:warn={!moment?.independent}>
    <strong>{moment?.independent ? 'This certificate was not valid at that time.' : 'The time this signature states is outside its certificate’s dates.'}</strong>
    It was valid from {UTC(signature.certificate.notBefore.value)} to {UTC(signature.certificate.notAfter.value)}, and the
    signature is dated {moment ? UTC(moment.time) : ''}.
  </div>
{/if}

{#if standing && listed}
  <!-- What the list says, with whose list and how old, on every path. -->
  {#if standing.result === 'qualified'}
    <div class="notice" class:ok={listBacksIt}>
      <strong>
        {country(listed.list)}'s trusted list treats this certificate as qualified{moment?.independent ? ' at the time it was signed' : ''}.
      </strong>
      {#if !moment?.independent}
        Nothing independent confirms that time, so nothing confirms the list applied then.
      {/if}
      <Info
        >Its provider was recorded as granted when the certificate was issued and at that time, and the
        rules of ETSI TS 119 615 give this result from what the list and the certificate say. The list's
        signature was verified up to the EU's Official Journal when this site read it. That is what a list
        can say: it does not establish that the signature is valid, or who the person is.</Info
      >
    </div>
  {:else if standing.result === 'not-qualified'}
    <div class="notice" class:bad={moment?.independent} class:warn={!moment?.independent}>
      <strong>
        {moment?.independent
          ? `${country(listed.list)}'s trusted list does not treat this certificate as qualified.`
          : `At the time this signature states, ${country(listed.list)}'s trusted list would not treat this certificate as qualified.`}
      </strong>
      {standing.detail}<Info
        >Whatever the certificate says about itself, the list is what decides this.</Info
      >
    </div>
  {:else}
    <div class="notice warn">
      <strong>Could not settle this against {country(listed.list)}'s trusted list.</strong>
      {standing.detail}
    </div>
  {/if}
{/if}

{#if signature.claims && !isTimestamp}
  <!--
    The level, from the certificate's own statements, kept apart from the app's
    findings: "this certificate says it is qualified" is a fact about the file; "this
    signature is qualified" is a judgement this app is not entitled to make.
  -->
  <SignatureLevel qualified={shownLevel.qualified} onQualifiedDevice={shownLevel.onQualifiedDevice} confirmed={levelConfirmed}>
    {#if signature.claims.purpose === 'seal'}Issued to an organisation, as a seal.{/if}
    {#if signature.claims.purpose === 'website'}
      It is a website certificate, which is not meant for signing documents.
    {/if}
    {#if signature.claims.limit}
      It declares a transaction limit of {signature.claims.limit.value.toLocaleString()}
      {signature.claims.limit.currency}.
    {/if}
    {#snippet checked()}
      {#if standing && listed}
        <span>
          Checked against {country(listed.list)}'s trusted list{listFacts ? `, issued ${day(listFacts.issued)}` : ''}, as this site read it on {index?.asOf ?? found?.asOf}.
        </span>
        <span class="action-group list-update">
          <button class="button secondary small" type="button" disabled={refreshing} onclick={() => void refresh()}>
            <Fresh text={refreshing ? 'Checking…' : 'Check for a newer copy'} />
          </button>
          <Info label="About updating the list"
            >Trusted lists cannot be read from a web page: their servers do not allow it. So this site reads
            them ahead of time, and this button fetches the newest copy it has. It cannot be newer than the
            last time the site read them.</Info
          >
          {#if refreshed}<span>{refreshed}</span>{/if}
        </span>
        {#if standing.result === 'qualified' && standing.onQualifiedDevice === null}
          <span>The list does not settle whether the key is on a qualified device, so that is not claimed here.</span>
        {/if}
        {#if listOverdue && listFacts}
          <span>This copy is out of date: the list named {day(listFacts.next)} for its next issue.</span>
        {/if}
      {:else}
        Read from the certificate itself, not checked against an official trust list.<Info label="About this signature level"
          >A certificate can state that it is qualified, and that its key is kept on a certified signing
          device such as a card or token. Whether that is true is decided against the trust list of the
          framework it was issued under. This signature could not be checked against one here{lookedUp && !listed ? ': its issuer is not on a list this site could verify' : ''}.</Info
        >
      {/if}
    {/snippet}
  </SignatureLevel>

  {#if signature.claims.keyUsage.stated && !signature.claims.keyUsage.digitalSignature && !signature.claims.keyUsage.nonRepudiation}
    <div class="notice warn">
      <strong>This certificate was not issued for signing.</strong>
      Readers that enforce key usage will reject it.<Info
        >Its key usage permits neither digital signature nor non-repudiation. The
        signature is still sound arithmetic.</Info
      >
    </div>
  {/if}
{/if}

<!--
  A token attached to a signature it does not describe, or one nobody really signed,
  would read as corroboration and be none, which is worth saying loudly.
-->
{#if stampShown?.standing === 'other-signature'}
  <div class="notice bad">
    <strong>The timestamp inside this signature is not for this signature.</strong>
    It attests to some other signature. Treat the time above as meaning nothing.
  </div>
{:else if stampShown?.standing === 'broken'}
  <div class="notice bad">
    <strong>The timestamp inside this signature does not hold up.</strong>
    It does not check out against its own certificate, so anyone could have written that time.
    Treat it as meaning nothing.
  </div>
{:else if stampShown?.standing === 'cannot-check'}
  <div class="notice warn">
    <strong>The timestamp inside this signature could not be checked.</strong>
    Treat the time above as unconfirmed.<Info
      >It uses something this browser cannot compute, or carries no certificate to check it
      against. That says nothing either way about whether it holds.</Info
    >
  </div>
{:else if timeAuthority}
  <div class="notice" class:ok={holds}>
    <strong>The time on this signature is not the signer's own.</strong>
    <span translate="no">{timeAuthority.stamp.signedBy ?? 'An authority'}</span> dated it {UTC(timeAuthority.stamp.time)}, an authority on {country(timeAuthority.list)}'s trusted list.<Info
      >So the time does not rest on the signer's computer. The list recorded that authority as granted at that
      time.</Info
    >
  </div>
{:else if signature.timestamp && !lookupFailed && lookedUp}
  <div class="notice">
    <strong>This signature carries a timestamp from <span translate="no">{signature.timestamp.signedBy ?? 'an unnamed authority'}</span>.</strong>
    That authority is not on a list this site could verify, so the time is not confirmed.<Info
      >The timestamp verifies against the certificate inside it, but anybody can make such a certificate and
      write any date. Whether that authority is worth believing is {judge}'s call.</Info
    >
  </div>
{/if}

{@render children?.()}

{#if offerRevocationList && issuerCertificate}
  <!-- From this site's copy, because no page can reach the authorities: no CORS header on any of them. -->
  {#if listFile?.answer}
    {@const answer = listFile.answer}
    {#if answer.standing === 'holds' && answer.status === 'revoked'}
      <div class="notice bad">
        <strong>The issuer's revocation list names this certificate.</strong>
        Revoked {answer.revokedAt ? UTC(answer.revokedAt) : 'at a time it does not give'}{moment ? `, and the signature is dated ${UTC(moment.time)}` : ''}.
      </div>
    {:else if clearedByList}
      <div class="notice" class:ok={holds}>
        <strong>The issuer's revocation list does not name this certificate.</strong>
        <span translate="no">{answer.from}</span> issued that list {answer.at ? UTC(answer.at) : ''}, after the signature.<Info
          >It verifies against the same key that issued this certificate, so only the issuer could have written
          it, and a certificate revoked before then would be on it.</Info
        >
      </div>
    {:else if answer.standing === 'holds' && answer.status === 'good'}
      <div class="notice warn">
        <strong>The issuer's revocation list does not name this certificate, but that settles nothing here.</strong>
        {listShortfall}
      </div>
    {:else if answer.standing === 'broken'}
      <div class="notice bad">
        <strong>That revocation list does not hold up.</strong>
        It does not verify against the key that issued this certificate.
      </div>
    {:else}
      <div class="notice warn">
        <strong>That revocation list could not be used.</strong>
        It could not be read, or it leaves certificates out on purpose, so what it omits means nothing.
      </div>
    {/if}
  {:else if listFile?.error}
    <div class="notice warn">{listFile.error}</div>
  {/if}

  {#if !clearedByList && listFile?.answer?.status !== 'revoked'}
    <div class="notice">
      <strong>{fetching ? 'Checking revocation…' : 'Revocation: not checked.'}</strong>
      {#if carriedRevocation === null}This signature carries no answer.{/if}<Info
        >No web page can ask an authority directly, so this site keeps copies of the revocation lists it can
        collect, as new as the site's last release. A copy is checked here against the key that issued this
        certificate. Nothing about you or the file is sent.</Info
      >
      {#if fetchFailed}
        <span>Could not reach this site's copy.</span>
        <span class="action-group list-update">
          <button class="button dark small" type="button" disabled={fetching} onclick={() => void fetchRevocationList()}>
            <Fresh text={fetching ? 'Fetching…' : 'Fetch it'} />
          </button>
        </span>
      {/if}
      {#if offerFile}
        <div class="field">
          <span class="field-label">Or add the list from a file</span>
          {#if signature.claims?.crlUrls.length}
            <p class="field-note">
              <!-- A link the reader follows, never a request this app makes. -->
              The authority publishes it at
              <a href={signature.claims.crlUrls[0]} target="_blank" rel="noopener noreferrer" translate="no">{signature.claims.crlUrls[0]}</a>.
            </p>
          {/if}
          <input
            class="input"
            type="file"
            accept=".crl,application/pkix-crl,application/x-pkcs7-crl"
            onchange={(event) => void takeRevocationList(event.currentTarget.files?.[0])}
          />
        </div>
      {/if}
    </div>
  {/if}
{/if}

<!--
  The limit of the check, next to the check rather than in a footnote. What it can say shrinks as
  more is established, and the last of it never goes: nothing here can confirm a person.
-->
<div class="notice">
  {#if listBacksIt && clearedByList}
    <strong>What this does not confirm:</strong> the person, or that the signature is valid. <em translate="no">{signature.signedBy ?? 'That name'}</em> is
    what the listed authority put in the certificate, including any role in it.
  {:else if listBacksIt}
    <strong>Not checked:</strong> whether this certificate had been revoked, the person, or whether the signature is valid.
    <em translate="no">{signature.signedBy ?? 'That name'}</em> is what the listed authority put in the certificate, including any role in it.
  {:else}
    <strong>Not checked:</strong> whether <em translate="no">{signature.signedBy ?? 'that signer'}</em> is who they say they are — {goTo}.
  {/if}<Info
    >A trust list says which authorities are recognised, and an authority checks a person when it issues a
    certificate. This app can read those facts. It cannot check the person itself, and it does not call a
    signature valid: that takes the full rules, including long-term proof and any revocation published
    since, which {judge} can apply and may answer differently. The name above is read out
    of the token, not vouched for.{@render limits?.()}
    {#if signature.claims?.ocspUrl}
      Where a live revocation question would go, uncalled:
      <span class="outgoing-list">
        <span><strong>Asked at:</strong> <code translate="no">{signature.claims.ocspUrl}</code></span>
      </span>
    {/if}</Info
  >
</div>

<style>
  .list-update {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
</style>
