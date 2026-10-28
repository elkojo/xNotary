/**
 * Czech text for /situations/, node by node. The English in situations.ts is the source; this
 * mirrors its shape exactly (situations.test.ts checks it) and uses the legal terms in
 * glossary.ts, never a near miss — "zaručený", not "pokročilý"; "uznávaný", not "uznaný".
 *
 * Unreviewed until a native speaker, a lawyer for the legal parts, has approved it: see
 * LANGUAGES in lang.svelte.ts and docs/i18n.md.
 */
import type { JourneyId, Light, NodeId } from './situations';

export interface QuestionCs {
  readonly title: string;
  readonly lead: string;
  readonly answers: readonly { readonly label: string; readonly hint?: string }[];
}

export interface OutcomeCs {
  readonly title: string;
  readonly lead: string;
  readonly steps: readonly string[];
  readonly go: readonly string[];
}

export const LIGHTS_CS: Readonly<Record<Light, { readonly label: string; readonly line: string }>> = {
  online: { label: 'Online', line: 'Lze vyřídit online, pokud jsou splněny podmínky níže.' },
  assisted: { label: 'S pomocí', line: 'Je potřeba krok někoho dalšího: příjemce, poskytovatele nebo odborníka.' },
  'in-person': { label: 'Osobně', line: 'Je potřeba zajít na úřad nebo k notáři.' },
};

export const JOURNEYS_CS: Readonly<
  Record<JourneyId, { readonly title: string; readonly description: string; readonly stages: readonly string[] }>
> = {
  official: {
    title: 'Nechat si úředně ověřit podpis',
    description: 'Někdo po vás chce ověřený nebo úředně ověřený podpis.',
    stages: ['Kam dokument jde', 'Co se po vás chce', 'Váš certifikát', 'Další krok'],
  },
  sign: {
    title: 'Podepsat dokument',
    description: 'Certifikátem, nebo obrázkem vašeho podpisu.',
    stages: ['Druh podpisu', 'Váš certifikát', 'Další krok'],
  },
  poa: {
    title: 'Udělit plnou moc',
    description: 'Aby za vás někdo jednal — soukromě, před úřadem nebo u notáře.',
    stages: ['K čemu slouží', 'Další krok'],
  },
  proof: {
    title: 'Doložit, že soubor existoval',
    description: 'Záznam tohoto přesného souboru v tomto čase, aniž byste ho kamkoli posílali.',
    stages: ['Co potřebujete', 'Další krok'],
  },
  check: {
    title: 'Zkontrolovat přijatý dokument',
    description: 'Co tvrdí podepsané PDF, nebo zda soubor odpovídá svému důkazu.',
    stages: ['Co jste dostali', 'Další krok'],
  },
  copy: {
    title: 'Získat ověřenou kopii',
    description: 'Kopii, kterou úřad uzná jako shodnou s originálem.',
    stages: ['Co máte', 'Další krok'],
  },
  company: {
    title: 'Založit nebo změnit firmu',
    description: 'Zakladatelské dokumenty a listiny pro obchodní rejstřík.',
    stages: ['Co potřebujete', 'Další krok'],
  },
  property: {
    title: 'Koupit nebo prodat nemovitost',
    description: 'Smlouva pro katastr nemovitostí, nebo podklady pro advokáta.',
    stages: ['Co podepisujete', 'Další krok'],
  },
  abroad: {
    title: 'Použít dokument v zahraničí',
    description: 'Podpis, prohlášení nebo kopie pro jinou zemi.',
    stages: ['Kam dokument jde', 'Co se po vás chce', 'Další krok'],
  },
};

/** Source labels, by URL. */
export const SOURCES_CS: Readonly<Record<string, string>> = {
  'https://www.dia.gov.cz/cs/legislativa/eidas-sluzby-vytvarejici-duveru-a-elektronicka-identifikace/informace-pro-uzivatele/pravo-na-nahrazeni-uredne-overeneho-podpisu-dle-ss-6-odst-2-zakona-c-12-2020-sb':
    'DIA: nahrazení úředně ověřeného podpisu (§ 6 odst. 2 zákona č. 12/2020 Sb.)',
  'https://www.zakonyprolidi.cz/cs/2020-12': 'Zákon č. 12/2020 Sb., § 6',
  'https://www.zakonyprolidi.cz/cs/2016-297': 'Zákon č. 297/2016 Sb., § 6 — uznávaný elektronický podpis',
  'https://portal.gov.cz/rozcestniky/zapis-kvalifikovaneho-certifikatu-do-registru-obyvatel-RZC-113':
    'Portál veřejné správy: zápis kvalifikovaného certifikátu do registru obyvatel',
  'https://eidas.ec.europa.eu/efda/trust-services/browse/eidas/tls':
    'Důvěryhodný seznam EU: kvalifikovaní poskytovatelé služeb vytvářejících důvěru',
  'https://www.zakonyprolidi.cz/cs/1992-358': 'Notářský řád, zákon č. 358/1992 Sb., § 64a a § 74a',
  'https://www.zakonyprolidi.cz/cs/2012-89': 'Občanský zákoník, zákon č. 89/2012 Sb., § 441 odst. 2',
  'https://www.zakonyprolidi.cz/cs/2006-21': 'Zákon č. 21/2006 Sb., o ověřování shody opisu nebo kopie s listinou a pravosti podpisu',
  'https://www.zakonyprolidi.cz/cs/2008-300': 'Zákon č. 300/2008 Sb., autorizovaná konverze dokumentů',
  'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02014R0910-20240520': 'Nařízení eIDAS (EU) č. 910/2014, čl. 25',
  'https://www.hcch.net/en/instruments/conventions/status-table/?cid=41': 'Haagská úmluva o apostile: smluvní státy',
};

const CZ_ROUTE_STEPS = [
  'Nejdřív zkontrolujte výjimku. Postup neplatí pro plnou moc k právnímu jednání, které vyžaduje formu veřejné listiny, například notářského zápisu (§ 6 odst. 3), a jiný zákon může vyžadovat zvláštní formu.',
  'Zapište svůj kvalifikovaný certifikát do registru obyvatel přes Portál občana (Profil → Certifikáty). Zapisuje se jen jeho veřejná část, nikdy klíč. Některé certifikáty obsahují identifikační údaje, se kterými zápis není nutný: poradí vám váš poskytovatel.',
  'Podepište dokument tímto certifikátem: se souborem s klíčem zde v „Podepsat PDF“, s kartou či tokenem v jejich vlastním programu. Zaručený elektronický podpis založený na kvalifikovaném certifikátu je podle českého práva uznávaný elektronický podpis.',
  'Odešlete dokument tak, jak úřad požaduje. Úřad ověří v registru, že certifikát je váš; tato stránka to neověřuje a ani nemůže.',
] as const;

export const NODES_CS: Readonly<Record<NodeId, QuestionCs | OutcomeCs>> = {
  // --- Úředně ověřený podpis ------------------------------------------------------------
  'official-where': {
    title: 'Kde bude dokument použit?',
    lead: 'Platí pravidla země, kam dokument míří — ne té, kde jste právě teď.',
    answers: [{ label: 'Česko (CZ)' }, { label: 'Jiná země EU' }, { label: 'Mimo EU' }],
  },
  'official-ask': {
    title: 'Co po vás příjemce chce?',
    lead: 'Podepsané PDF, úředně ověřený podpis a notářský zápis jsou tři různé věci. Pokud si nejste jistí, zvolte poslední odpověď.',
    answers: [
      { label: 'Úředně ověřený podpis', hint: 'Vyžaduje ho zákon.' },
      { label: 'Plnou moc s úředně ověřeným podpisem' },
      { label: 'Elektronický podpis na PDF', hint: 'Podepsaný dokument, bez úředního ověření.' },
      { label: 'Notářský zápis', hint: 'Listinu, kterou musí sepsat notář.' },
      { label: 'Nevím jistě' },
    ],
  },
  'official-cert': {
    title: 'Máte kvalifikovaný certifikát pro elektronický podpis?',
    lead: 'Vydává ho kvalifikovaný poskytovatel služeb vytvářejících důvěru poté, co ověří vaši totožnost. Certifikát od zaměstnavatele nebo z interního systému se nepočítá.',
    answers: [
      { label: 'Ano', hint: 'Jako soubor s klíčem (.p12, .pfx), nebo na kartě či tokenu.' },
      { label: 'Ne, nebo nevím' },
    ],
  },
  'official-cz': {
    title: 'Možná notáře vůbec nepotřebujete',
    lead: 'Kde zákon vyžaduje úředně ověřený podpis, uznává české právo místo něj uznávaný elektronický podpis — pokud úřad může z registru obyvatel ověřit, že kvalifikovaný certifikát patří vám (§ 6 odst. 2 zákona č. 12/2020 Sb.).',
    steps: CZ_ROUTE_STEPS,
    go: ['Podepsat PDF'],
  },
  'official-nocert': {
    title: 'Nejdřív si pořiďte kvalifikovaný certifikát',
    lead: 'Je to jediný krok, který online postup nepřeskočí, a zajišťuje ho kvalifikovaný poskytovatel služeb vytvářejících důvěru, ne tato stránka.',
    steps: [
      'Vyberte si poskytovatele, který je pro Česko uveden v důvěryhodném seznamu EU.',
      'Ověří vaši totožnost — na pobočce, nebo u některých poskytovatelů online — a vydá certifikát jako soubor s klíčem nebo na kartě.',
      'Pak pokračujte postupem: zapište certifikát přes Portál občana, podepište jím dokument a odešlete ho tak, jak úřad požaduje.',
    ],
    go: [],
  },
  'official-eu': {
    title: 'Zeptejte se příjemce, co přijme',
    lead: 'Každá země si sama určuje, jak se podpis úředně ověřuje. Kvalifikovaný elektronický podpis má v celé EU účinky vlastnoručního podpisu, sám o sobě ale nikde není úředně ověřeným podpisem.',
    steps: [
      'Zeptejte se, zda přijmou kvalifikovaný elektronický podpis, nebo elektronickou náhradu ověřeného podpisu podle práva své země.',
      'Pokud ne: notář, doma nebo v jejich zemi. Někteří jednají na dálku, přes videokonferenci.',
      'Podpis vytvořený zde ze souboru s klíčem je zaručený, ne kvalifikovaný: ověřte si, že příjemce tuto úroveň přijme.',
    ],
    go: [],
  },
  'official-deed': {
    title: 'Tady je potřeba notář',
    lead: 'Notářský zápis sepisuje notář. Žádný nástroj pro podpis, tady ani jinde, ho nevytvoří.',
    steps: [
      'Zeptejte se příjemce, ze které země musí zápis pocházet.',
      'Zeptejte se tamního notáře, zda se můžete zúčastnit přes videokonferenci. V Česku to notářský řád umožňuje s prostředkem pro elektronickou identifikaci s vysokou úrovní záruky (§ 64a), pokud to notář nabízí.',
    ],
    go: [],
  },
  'official-unsure': {
    title: 'Nejdřív zjistěte, co se vyžaduje',
    lead: 'Podpis PDF, úřední ověření podpisu a sepsání notářského zápisu jsou různé postupy. Udělat ten nesprávný stojí víc než se zeptat.',
    steps: [
      'Zeptejte se příjemce: přijmete elektronický podpis, nebo potřebujete úředně ověřený podpis či notářský zápis?',
      'Pokud úředně ověřený podpis: zeptejte se, který zákon ho vyžaduje. Online postup platí jen tam, kde ho vyžaduje zákon.',
      'Vraťte se s odpovědí a začněte znovu.',
    ],
    go: [],
  },

  // --- Podpis ---------------------------------------------------------------------------
  'sign-kind': {
    title: 'Jaký podpis příjemce očekává?',
    lead: 'Obrázek podpisu a podpis certifikátem vypadají na stránce stejně. Nejsou to ale totéž.',
    answers: [
      { label: 'Podpis certifikátem', hint: 'Digitální podpis: ukazuje, kdo drží klíč, a že se soubor od podpisu nezměnil.' },
      { label: 'Jen obrázek mého podpisu', hint: 'Kde stačí viditelná značka: formuláře, dopisy.' },
      { label: 'Úředně ověřený podpis', hint: 'Ověřený nebo legalizovaný.' },
    ],
  },
  'sign-setup': {
    title: 'Máte certifikát, kterým můžete podepisovat?',
    lead: 'Vydává ho certifikační autorita poté, co ověří vaši totožnost. Právě ten spojuje podpis s vámi.',
    answers: [
      { label: 'Ano, jako soubor s klíčem', hint: 'Soubor .p12, .pfx nebo .pem a jeho heslo.' },
      { label: 'Ano, na kartě nebo tokenu', hint: 'Čipová karta, USB token nebo občanský průkaz s čipem.' },
      { label: 'Ne, nebo nevím' },
    ],
  },
  'sign-keyfile': {
    title: 'Podepište ho souborem s klíčem',
    lead: '„Podepsat PDF“ umístí váš podpis na stránku a podepíše soubor vaším certifikátem, přímo v tomto prohlížeči.',
    steps: [
      'Soubor s klíčem se čte ve vašem zařízení a nikam se neodesílá.',
      'Podpis ze souboru s klíčem je zaručený elektronický podpis, nikdy kvalifikovaný: soubor lze zkopírovat. Ověřte si, že příjemce tuto úroveň přijme.',
    ],
    go: ['Podepsat PDF'],
  },
  'sign-card': {
    title: 'Použijte program ke své kartě',
    lead: 'Ke klíči na kartě nebo tokenu se webová stránka nedostane, takže tato stránka jím podepisovat neumí. Právě to, že klíč nikdy neopustí certifikovaný hardware, dělá takový podpis kvalifikovaným.',
    steps: [
      'Podepište programem, který jste dostali ke kartě, nebo který poskytuje vaše certifikační autorita.',
      'Co podepsaný soubor tvrdí, pak můžete zkontrolovat zde.',
    ],
    go: ['Zkontrolovat podepsané PDF'],
  },
  'sign-nocert': {
    title: 'Nejdřív si pořiďte certifikát',
    lead: 'Certifikační autorita ho vydá poté, co ověří vaši totožnost — někde online, jinde osobně.',
    steps: [
      'Zeptejte se příjemce, jakou úroveň podpisu přijme.',
      'Pro kvalifikovaný certifikát vyberte poskytovatele z důvěryhodného seznamu toho právního rámce, ve kterém příjemce působí — v EU kvalifikovaného poskytovatele služeb vytvářejících důvěru.',
      'Pak se vraťte a podepište souborem s klíčem, který vám vydá, nebo jeho vlastním programem, pokud klíč zůstává na kartě.',
    ],
    go: [],
  },
  'sign-picture': {
    title: 'Dejte na něj obrázek svého podpisu',
    lead: 'Obrázek si vytvořte jednou a pak ho umístěte na PDF.',
    steps: ['Obrázek nic nedokazuje o tom, kdo ho tam dal: kdokoli s tímto obrázkem může udělat totéž.'],
    go: ['Vytvořit obrázek podpisu', 'Umístit ho na PDF'],
  },

  // --- Plná moc -------------------------------------------------------------------------
  'poa-what': {
    title: 'K čemu bude plná moc sloužit?',
    lead: 'Jakou formu potřebuje, záleží na tom, co s ní zmocněnec udělá.',
    answers: [
      { label: 'Soukromá záležitost', hint: 'Vyzvednutí zásilky, jednání s pronajímatelem nebo firmou.' },
      { label: 'Jednání s úřadem v Česku', hint: 'Když úřad chce úředně ověřený podpis.' },
      { label: 'Úkon, který vyžaduje notářský zápis', hint: 'Založení firmy, některé věci kolem nemovitostí a rodiny.' },
      { label: 'Použití v zahraničí' },
    ],
  },
  'poa-private': {
    title: 'Podepište ji a předejte zmocněnci',
    lead: 'Plná moc pro soukromou záležitost nepotřebuje zvláštní formu, pokud ji druhá strana nevyžaduje.',
    steps: [
      'Napište, kdo smí jednat, v čem a do kdy.',
      'Podepište ji — certifikátem pro silnější důkaz, kdo podepsal, nebo vlastnoručně.',
      'Zeptejte se toho, kdo se na ni bude spoléhat, zda chce podpis úředně ověřený.',
    ],
    go: ['Podepsat PDF'],
  },
  'poa-deed': {
    title: 'Podpis na ní musí ověřit oprávněná osoba',
    lead: 'Pro úkon, který vyžaduje formu veřejné listiny, potřebuje plná moc úředně ověřený podpis, a elektronická náhrada podle § 6 odst. 2 zákona č. 12/2020 Sb. se na ni nevztahuje (§ 6 odst. 3).',
    steps: [
      'Nechte podpis ověřit osobně, u notáře nebo na pracovišti Czech POINT.',
      'Nebo se zeptejte notáře, zda umí ověřit elektronický podpis na dálku (§ 74a notářského řádu), nebo zda se notářského úkonu můžete místo udělení plné moci zúčastnit sami přes videokonferenci (§ 64a).',
      'Postup si s notářem domluvte předem: ne každý notář vzdálené možnosti nabízí.',
    ],
    go: [],
  },

  // --- Důkaz existence ------------------------------------------------------------------
  'proof-kind': {
    title: 'Vytvořit nový důkaz, nebo ověřit ten, který máte?',
    lead: 'Ani k jednomu nepotřebujete certifikát.',
    answers: [
      { label: 'Vytvořit důkaz pro soubor teď', hint: 'Později doložíte, že tato přesná verze už tehdy existovala.' },
      { label: 'Ověřit důkaz, který už mám', hint: 'Porovnat původní soubor s jeho certifikátem.' },
    ],
  },
  'proof-make': {
    title: 'Opatřete soubor časovým razítkem',
    lead: 'Vaše zařízení opustí jen otisk souboru. Soubor a jeho certifikát uchovávejte spolu.',
    steps: ['Časové razítko ukazuje, že soubor do té doby existoval. Neříká nic o tom, kdo ho napsal ani zda je pravdivý.'],
    go: ['Doložit, že soubor existoval'],
  },
  'proof-check': {
    title: 'Porovnejte soubor s jeho certifikátem',
    lead: 'Potřebujete původní, nezměněný soubor a certifikát, který pro něj vznikl.',
    steps: ['Shoda ukazuje, že soubor existoval nejpozději k času uvedenému v certifikátu. Neukazuje, kdo ho napsal.'],
    go: ['Ověřit důkaz xNotary'],
  },

  // --- Kontrola -------------------------------------------------------------------------
  'check-kind': {
    title: 'Co jste dostali?',
    lead: 'Dvě různé kontroly pro dvě různé věci.',
    answers: [
      { label: 'Podepsané PDF', hint: 'Kdo ho podle něj podepsal a zda se od té doby změnilo.' },
      { label: 'Soubor a jeho certifikát xNotary', hint: 'Porovnat soubor s důkazem.' },
    ],
  },
  'check-pdf': {
    title: 'Podívejte se, co tvrdí podpisy v něm',
    lead: '„Zkontrolovat PDF“ přečte každý podpis a zjistí, zda se soubor od podpisu změnil.',
    steps: ['Zda si certifikát podepisujícího zaslouží důvěru, posoudí váš prohlížeč PDF podle důvěryhodného seznamu právního rámce, ve kterém byl vydán.'],
    go: ['Zkontrolovat podepsané PDF'],
  },

  // --- Ověřená kopie --------------------------------------------------------------------
  'copy-what': {
    title: 'Co potřebujete?',
    lead: 'Sken, otisk ani časové razítko nejsou ověřená kopie: ukazují, kdy soubor existoval, ne že odpovídá papírovému originálu.',
    answers: [
      { label: 'Ověřenou kopii papírové listiny', hint: 'Vidimaci.' },
      {
        label: 'Papírovou listinu v elektronické podobě se stejnými právními účinky',
        hint: 'Nebo naopak. Autorizovanou konverzi.',
      },
    ],
  },
  'copy-paper': {
    title: 'Nechte si kopii ověřit osobně',
    lead: 'Oprávněné pracoviště porovná kopii s originálem a ověří, že se shodují.',
    steps: [
      'Zaneste originál na pracoviště Czech POINT (mnoho poboček pošty a obecních úřadů) nebo k notáři.',
      'Pokud potřebujete jen doložit, že soubor v daném čase existoval, časové razítko to udělá online — ověřená kopie to ale není.',
    ],
    go: ['Raději doložit, že soubor existoval'],
  },
  'copy-convert': {
    title: 'Požádejte o autorizovanou konverzi',
    lead: 'Autorizovaná konverze převede papírový dokument na elektronický, nebo naopak, se stejnými právními účinky, jako má originál.',
    steps: ['Provádí ji pracoviště Czech POINT, notář nebo jiné oprávněné pracoviště. Vezměte s sebou originál.'],
    go: [],
  },

  // --- Firma ----------------------------------------------------------------------------
  'company-what': {
    title: 'Co potřebujete udělat?',
    lead: 'Některé firemní dokumenty vyžadují notáře, jiným stačí ověřený podpis.',
    answers: [
      { label: 'Založit firmu nebo změnit zakladatelský dokument', hint: 'Například společnost s ručením omezeným (s.r.o.).' },
      { label: 'Podepsat listinu pro obchodní rejstřík', hint: 'Například souhlas vlastníka s umístěním sídla.' },
    ],
  },
  'company-deed': {
    title: 'Tady je potřeba notářský zápis',
    lead: 'Založení společnosti s ručením omezeným a změna jejího zakladatelského dokumentu se dělají před notářem, formou notářského zápisu.',
    steps: [
      'Zeptejte se notáře, zda se můžete zúčastnit přes videokonferenci s prostředkem pro elektronickou identifikaci (§ 64a notářského řádu). Ne každý notář to nabízí.',
      'Notář obvykle podá změnu do obchodního rejstříku sám.',
    ],
    go: [],
  },
  'company-filing': {
    title: 'Podepište ji uznávaným elektronickým podpisem',
    lead: 'Kde rejstřík na takové listině vyžaduje úředně ověřený podpis, platí český online postup: uznávaný elektronický podpis na kvalifikovaném certifikátu, který lze přes registr obyvatel přiřadit k vám (§ 6 odst. 2 zákona č. 12/2020 Sb.).',
    steps: CZ_ROUTE_STEPS,
    go: ['Podepsat PDF'],
  },

  // --- Nemovitost -----------------------------------------------------------------------
  'property-what': {
    title: 'Co potřebujete podepsat?',
    lead: 'Smlouva, podle které bude katastr zapisovat, a podklad pro advokáta mají různé požadavky.',
    answers: [{ label: 'Kupní smlouvu pro katastr nemovitostí' }, { label: 'Návrh nebo podklad pro advokáta' }],
  },
  'property-contract': {
    title: 'Zeptejte se advokáta nebo katastrálního úřadu, jakou formu potřebuje',
    lead: 'Katastr nemovitostí má vlastní pravidla pro to, jak se smlouva podepisuje, na papíře i elektronicky, a každá strana je musí splnit.',
    steps: [
      'Zeptejte se, jaké podpisy přijme od každé strany a zda smlouva potřebuje kvalifikované elektronické časové razítko.',
      'Časové razítko z této stránky je ukotvené v Bitcoinu: dokládá, kdy soubor existoval, ale kvalifikované časové razítko to není.',
    ],
    go: [],
  },

  // --- Zahraničí ------------------------------------------------------------------------
  'abroad-where': {
    title: 'Kde bude dokument použit?',
    lead: 'Platí pravidla země, kam dokument míří.',
    answers: [{ label: 'Jiná země EU' }, { label: 'Mimo EU' }, { label: 'Česko (CZ)' }],
  },
  'abroad-ask-eu': {
    title: 'Co po vás příjemce chce?',
    lead: 'Pokud si nejste jistí, zeptejte se ho dřív, než cokoli podepíšete.',
    answers: [
      { label: 'Elektronický podpis' },
      { label: 'Prohlášení nebo čestné prohlášení podepsané před notářem' },
      { label: 'Ověřenou kopii' },
    ],
  },
  'abroad-ask-world': {
    title: 'Co po vás příjemce chce?',
    lead: 'Pokud si nejste jistí, zeptejte se ho dřív, než cokoli podepíšete.',
    answers: [
      { label: 'Elektronický podpis' },
      { label: 'Úředně ověřený podpis, nebo prohlášení před notářem', hint: 'Včetně místopřísežného prohlášení (affidavit).' },
      { label: 'Ověřenou kopii' },
    ],
  },
  'abroad-esig-eu': {
    title: 'Kvalifikovaný podpis platí v celé EU',
    lead: 'V EU má kvalifikovaný elektronický podpis účinky vlastnoručního podpisu a podpis vytvořený v jednom členském státě uznávají všechny ostatní.',
    steps: [
      'Podpis vytvořený zde ze souboru s klíčem je zaručený, ne kvalifikovaný. Ověřte si, že ho příjemce přijme, nebo podepište kvalifikovaným podpisem od svého poskytovatele.',
      'Zeptejte se, zda podpis nepotřebují navíc úředně ověřený: kvalifikovaný podpis to není.',
    ],
    go: ['Podepsat PDF'],
  },
  'abroad-esig-world': {
    title: 'Zeptejte se příjemce, jaké podpisy přijme',
    lead: 'Mimo EU nic nenutí příjemce přijmout elektronický podpis vytvořený podle pravidel EU.',
    steps: [
      'Zeptejte se, jaký druh elektronického podpisu a jaký formát přijme.',
      'Pokud přijme podpis certifikátem, podepište PDF a pošlete ho tak, jak požaduje.',
    ],
    go: ['Podepsat PDF'],
  },
  'abroad-sworn-eu': {
    title: 'Tady je potřeba notář',
    lead: 'Prohlášení „před notářem“ znamená, že notář vidí, jak podepisujete, a ověří to. Žádný nástroj pro podpis to nedokáže.',
    steps: [
      'Notář v Česku ověří váš podpis na prohlášení, i na anglickém formuláři.',
      'Zeptejte se příjemce, zda navíc nepotřebuje překlad nebo apostilu na notářském ověření.',
    ],
    go: [],
  },
  'abroad-sworn-world': {
    title: 'Notář a obvykle apostila',
    lead: 'Notář ověří váš podpis. Mimo EU chce země příjemce obvykle ještě apostilu na tomto ověření — nebo, pokud není stranou Haagské úmluvy, superlegalizaci.',
    steps: [
      'Nechte si podpis ověřit u notáře.',
      'Zeptejte se příjemce, zda potřebuje apostilu, superlegalizaci nebo překlad, a ověřte si zemi v seznamu smluvních států úmluvy.',
    ],
    go: [],
  },
};
