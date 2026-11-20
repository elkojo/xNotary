<!--
  The thank-you and the voluntary payment: the whole of /support/ (app/hub/Support.svelte), and
  the dialog every service opens once a task is finished (SupportLink.svelte). One component, so
  the two cannot drift. Voluntary, always — nothing on the site waits for it, and it cannot know
  whether anyone paid. It asks nobody: both QR codes were drawn at build time
  (app/scripts/support-qr.ts), and a wallet or banking app that scans one talks to its own
  service directly. Card and sharing are shown, and say they are not built yet.

  Its text is ours in every language (docs/i18n.md), like the bar's: it follows the site's
  language, also inside the dialog on a service screen, and is marked so a browser translator
  leaves it alone.
-->
<script lang="ts">
  import Fresh from './Fresh.svelte';
  import Info from './Info.svelte';
  import { pick, site } from './lang.svelte';
  import { BANK_IBAN, BANK_MESSAGE, LIGHTNING, czechAccount, groupIban, lightningUri } from './support';

  let {
    heading = 'h1',
    titleId = 'support-title',
  }: {
    /** `h1` on /support/; `h2` in the dialog, which sits on a page that has its own. */
    heading?: 'h1' | 'h2';
    titleId?: string;
  } = $props();

  const TEXT = {
    en: {
      done: 'Thank you for using xNotary.digital.',
      lead: 'Did it save you',
      mark: 'time?',
      lede: 'You can support the work with a payment.',
      methods: 'Payment method',
      bank: 'Bank QR (CZK)',
      card: 'Card',
      cardAbout: 'About card payment',
      soon: 'Under development.',
      copied: 'Copied',
      select: 'Copying is not available here. Select it:',
      lnQr: 'QR code for a Lightning payment',
      lnTitle: 'Pay with Lightning',
      lnScan: 'Scan the code with a Lightning wallet and choose the amount there.',
      lnAbout: 'About Lightning payment',
      lnInfo:
        "The code points your wallet at the project's Lightning address, and your wallet talks to it directly. This page sends nothing, and cannot see whether you paid.",
      lnOpen: 'Open in wallet',
      lnCopy: 'Copy code',
      bankQr: 'QR code for a bank transfer in Czech crowns',
      bankTitle: 'Pay by bank transfer',
      bankScan: 'Scan the code with your banking app and choose the amount there.',
      bankAbout: 'About bank QR payment',
      bankInfo:
        "A QR Platba code, which Czech banking apps read. It holds the project's account, the currency, Czech crowns (CZK), and a message for the recipient — no amount and no date. This page sends nothing, and cannot see whether you paid.",
      account: 'Account',
      message: 'Message',
      copyAccount: 'Copy account',
      copyIban: 'Copy IBAN',
      share: 'Share xNotary.digital',
      shareAbout: 'About sharing',
      shareNames: { 'Copy link': 'Copy link', Email: 'Email', X: 'X', LinkedIn: 'LinkedIn', Reddit: 'Reddit' },
    },
    cs: {
      done: 'Děkujeme, že používáte xNotary.digital.',
      lead: 'Ušetřilo vám to',
      mark: 'čas?',
      lede: 'Práci můžete podpořit platbou.',
      methods: 'Způsob platby',
      bank: 'QR platba (CZK)',
      card: 'Karta',
      cardAbout: 'O platbě kartou',
      soon: 'Připravujeme.',
      copied: 'Zkopírováno',
      select: 'Kopírování tu není k dispozici. Označte text:',
      lnQr: 'QR kód pro platbu přes Lightning',
      lnTitle: 'Platba přes Lightning',
      lnScan: 'Naskenujte kód Lightning peněženkou a částku zvolte v ní.',
      lnAbout: 'O platbě přes Lightning',
      lnInfo:
        'Kód nasměruje vaši peněženku na Lightning adresu projektu a peněženka s ní komunikuje přímo. Tato stránka nic neodesílá a nevidí, zda jste zaplatili.',
      lnOpen: 'Otevřít v peněžence',
      lnCopy: 'Kopírovat kód',
      bankQr: 'QR kód pro převod v korunách',
      bankTitle: 'Platba převodem',
      bankScan: 'Naskenujte kód v aplikaci své banky a částku zvolte v ní.',
      bankAbout: 'O QR platbě',
      bankInfo:
        'Kód QR Platby, který čtou aplikace českých bank. Obsahuje účet projektu, měnu (Kč, CZK) a zprávu pro příjemce — žádnou částku ani datum. Tato stránka nic neodesílá a nevidí, zda jste zaplatili.',
      account: 'Číslo účtu',
      message: 'Zpráva pro příjemce',
      copyAccount: 'Kopírovat účet',
      copyIban: 'Kopírovat IBAN',
      share: 'Sdílet xNotary.digital',
      shareAbout: 'O sdílení',
      shareNames: { 'Copy link': 'Kopírovat odkaz', Email: 'E-mail', X: 'X', LinkedIn: 'LinkedIn', Reddit: 'Reddit' },
    },
  };
  const t = $derived(pick(TEXT));
  /** Text this layer translated: in its language, and left alone by a browser translator. */
  const ours = $derived(site.lang === 'en' ? {} : { lang: site.lang, translate: 'no' as const });

  type Method = 'lightning' | 'bank';
  let method = $state<Method>('lightning');

  const ACCOUNT = czechAccount(BANK_IBAN);
  /** What each copy button copies. The IBAN goes without spaces: some banking apps refuse them. */
  const COPIES = { code: LIGHTNING, account: ACCOUNT, iban: BANK_IBAN } as const;
  type Copyable = keyof typeof COPIES;

  let copied = $state<Copyable | null>(null);
  let failed = $state<Copyable | null>(null);

  async function copy(what: Copyable) {
    try {
      await navigator.clipboard.writeText(COPIES[what]);
      copied = what;
      failed = null;
      setTimeout(() => {
        if (copied === what) copied = null;
      }, 2500);
    } catch {
      // No clipboard (an older browser, a refused permission): show the text to select instead.
      failed = what;
    }
  }

  const SHARE = ['Copy link', 'Email', 'X', 'LinkedIn', 'Reddit'] as const;
</script>

{#snippet icon(name: string)}
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {#if name === 'lightning'}
      <path d="M13.5 2.5L5 13.5h6l-1 8 8.5-11h-6l1-8z" />
    {:else if name === 'card'}
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19M6 15h4" />
    {:else if name === 'bank'}
      <path d="M3 9.5L12 4l9 5.5M4.5 10v8M9 10v8M15 10v8M19.5 10v8M3 20.5h18" />
    {:else if name === 'Copy link'}
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path
        d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"
      />
    {:else if name === 'Email'}
      <rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6.5L20.5 7" />
    {:else if name === 'X'}
      <path d="M4.5 4h4l11 16h-4zM19.5 4l-6.2 7M4.5 20l6.2-7" />
    {:else if name === 'LinkedIn'}
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10.5V17M8 7.25v.01M12 17v-6.5M12 13.25c0-1.75 1-2.75 2.5-2.75S17 11.5 17 13.25V17" />
    {:else if name === 'Reddit'}
      <ellipse cx="12" cy="14.5" rx="7.5" ry="5" /><path d="M12 9.5l1.25-5 4 1M9.25 16.75c1.5 1 4 1 5.5 0" /><circle
        cx="18.5"
        cy="5.75"
        r="1.25"
      /><path d="M9.5 13.5v.01M14.5 13.5v.01" />
    {/if}
  </svg>
{/snippet}

{#snippet selectable(what: Copyable)}
  {#if failed === what}
    <label class="pay-code">
      <span>{t.select}</span>
      <input class="input" readonly translate="no" value={COPIES[what]} onfocus={(e) => e.currentTarget.select()} />
    </label>
  {/if}
{/snippet}

<p class="support-done" {...ours}>{t.done}</p>

<section class="support-card" aria-labelledby={titleId} {...ours}>
  <svelte:element this={heading} id={titleId} class="support-title">{t.lead} <mark class="hlm">{t.mark}</mark></svelte:element>
  <p class="support-lede">{t.lede}</p>

  <div class="choice-row support-methods" role="group" aria-label={t.methods}>
    <button
      type="button"
      class="choice"
      class:selected={method === 'lightning'}
      aria-pressed={method === 'lightning'}
      onclick={() => (method = 'lightning')}
    >
      {@render icon('lightning')} <span translate="no">Lightning</span>
    </button>
    <button
      type="button"
      class="choice"
      class:selected={method === 'bank'}
      aria-pressed={method === 'bank'}
      onclick={() => (method = 'bank')}
    >
      {@render icon('bank')} <Fresh text={t.bank} />
    </button>
    <span class="method-soon">
      <button type="button" class="choice" disabled>{@render icon('card')} <Fresh text={t.card} /></button><Info
        label={t.cardAbout}>{t.soon}</Info
      >
    </span>
  </div>

  {#if method === 'lightning'}
    <div class="pay-panel">
      <div class="pay-qr" role="img" aria-label={t.lnQr}>
        <!-- An SVG this build drew from a constant, never input. -->
        {@html __LIGHTNING_QR__}
      </div>
      <div class="pay-text">
        <h2>{t.lnTitle}</h2>
        <p>{t.lnScan}<Info label={t.lnAbout}>{t.lnInfo}</Info></p>
        <div class="action-group">
          <a class="button dark" href={lightningUri(LIGHTNING)}><Fresh text={t.lnOpen} /></a>
          <button type="button" class="button secondary" onclick={() => void copy('code')}>
            <Fresh text={copied === 'code' ? t.copied : t.lnCopy} />
          </button>
        </div>
        {@render selectable('code')}
      </div>
    </div>
  {:else}
    <div class="pay-panel">
      <div class="pay-qr" role="img" aria-label={t.bankQr}>
        <!-- An SVG this build drew from a constant, never input. -->
        {@html __BANK_QR__}
      </div>
      <div class="pay-text">
        <h2>{t.bankTitle}</h2>
        <p>{t.bankScan}<Info label={t.bankAbout}>{t.bankInfo}</Info></p>
        <dl class="pay-account">
          <div><dt>{t.account}</dt><dd translate="no">{ACCOUNT}</dd></div>
          <div><dt>IBAN</dt><dd translate="no">{groupIban(BANK_IBAN)}</dd></div>
          <div><dt>{t.message}</dt><dd translate="no">{BANK_MESSAGE}</dd></div>
        </dl>
        <div class="action-group">
          <button type="button" class="button secondary" onclick={() => void copy('account')}>
            <Fresh text={copied === 'account' ? t.copied : t.copyAccount} />
          </button>
          <button type="button" class="button secondary" onclick={() => void copy('iban')}>
            <Fresh text={copied === 'iban' ? t.copied : t.copyIban} />
          </button>
        </div>
        {@render selectable('account')}
        {@render selectable('iban')}
      </div>
    </div>
  {/if}
</section>

<div class="support-share" {...ours}>
  <span class="share-label">{t.share}<Info label={t.shareAbout}>{t.soon}</Info></span>
  <div class="share-icons">
    {#each SHARE as name}
      <button type="button" class="share-icon" disabled aria-label={t.shareNames[name]} title={t.shareNames[name]}>
        {@render icon(name)}
      </button>
    {/each}
  </div>
</div>
