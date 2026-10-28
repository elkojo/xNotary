/**
 * The legal terms the site's Czech must use, from the statutes that define them (Act 12/2020
 * Coll., Act 297/2016 Coll., the Notarial Code, the Civil Code). Machine translation reaches for
 * near misses that change the meaning — "pokročilý podpis" for an advanced signature, "uznaný"
 * for recognised — so every Czech text is checked against this list (situations.test.ts).
 *
 * `en` finds the term in the English source; `cs` must then match the Czech, in any inflection.
 */
export const GLOSSARY_CS: readonly { readonly en: RegExp; readonly cs: RegExp; readonly note: string }[] = [
  { en: /officially verified signature/iu, cs: /úředně ověřen\p{L}* podpis|úřední ověření podpisu/iu, note: 'úředně ověřený podpis' },
  { en: /recognised electronic signature/iu, cs: /uznávan\p{L}* elektronick\p{L}* podpis/iu, note: 'uznávaný elektronický podpis (297/2016, § 6)' },
  { en: /advanced (electronic )?signature|is advanced, not/iu, cs: /zaručen\p{L}*/iu, note: 'zaručený elektronický podpis' },
  { en: /qualified electronic signature/iu, cs: /kvalifikovan\p{L}* elektronick\p{L}* podpis/iu, note: 'kvalifikovaný elektronický podpis' },
  { en: /qualified certificate/iu, cs: /kvalifikovan\p{L}* certifikát/iu, note: 'kvalifikovaný certifikát' },
  { en: /qualified trust service provider/iu, cs: /kvalifikovan\p{L}* poskytovatel\p{L}* služeb vytvářejících důvěru/iu, note: 'kvalifikovaný poskytovatel služeb vytvářejících důvěru' },
  { en: /population register/iu, cs: /registr\p{L}* obyvatel/iu, note: 'registr obyvatel' },
  { en: /public deed/iu, cs: /veřejn\p{L}* listin/iu, note: 'veřejná listina' },
  { en: /notarial deed/iu, cs: /notářsk\p{L}* zápis/iu, note: 'notářský zápis' },
  { en: /power of attorney/iu, cs: /pln\p{L}* moc/iu, note: 'plná moc' },
  { en: /certified copy/iu, cs: /ověřen\p{L}* kopi/iu, note: 'ověřená kopie (vidimace)' },
  { en: /authorised conversion/iu, cs: /autorizovan\p{L}* konverz/iu, note: 'autorizovaná konverze dokumentů' },
  { en: /trust list/iu, cs: /důvěryhodn\p{L}* seznam/iu, note: 'důvěryhodný seznam' },
  { en: /land registry/iu, cs: /katastr/iu, note: 'katastr nemovitostí' },
  { en: /commercial register/iu, cs: /obchodní\p{L}* rejstřík|obchodního rejstříku|obchodním rejstříku/iu, note: 'obchodní rejstřík' },
  { en: /apostille/iu, cs: /apostil/iu, note: 'apostila' },
  { en: /consular legalisation/iu, cs: /superlegalizac/iu, note: 'superlegalizace' },
  { en: /timestamp/iu, cs: /časov\p{L}* razítk/iu, note: 'časové razítko' },
  { en: /key file/iu, cs: /soubor\p{L}* s klíčem/iu, note: 'soubor s klíčem' },
  { en: /Act 12\/2020 Coll\./u, cs: /zákona č\. 12\/2020 Sb\./u, note: 'zákon č. 12/2020 Sb.' },
  { en: /§ 6\(2\)/u, cs: /§ 6 odst\. 2/u, note: '§ 6 odst. 2' },
  { en: /§ 6\(3\)/u, cs: /§ 6 odst\. 3/u, note: '§ 6 odst. 3' },
  { en: /Notarial Code/u, cs: /notářsk\p{L}* řád/iu, note: 'notářský řád' },
];

/** Never in the site's Czech: near misses with a different meaning, and claims it may not make. */
export const FORBIDDEN_CS: readonly { readonly cs: RegExp; readonly why: string }[] = [
  { cs: /pokročil\p{L}* (elektronick\p{L}* )?podpis/iu, why: 'the legal term is "zaručený"' },
  { cs: /uznan\p{L}* elektronick\p{L}* podpis/iu, why: 'the legal term is "uznávaný"' },
  { cs: /notariz|notarizac/iu, why: '"notarizace" is not a Czech legal act; it reads as úřední ověření' },
  { cs: /(tato stránka|xNotary|xSignature) (ověří|ověřuje|legalizuje|certifikuje)(?! to neověřuje)/iu, why: 'the site performs no official act' },
];
