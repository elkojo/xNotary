/**
 * A signature's level, as every service on the site names it, from what the signer's
 * certificate says about itself.
 *
 * Read, never judged. A certificate can state that it is qualified (ETSI's QcCompliance) and
 * that its key is kept on a certified signing device (QcSSCD); whether either is true is settled
 * against the trust list of the framework it was issued under, which no page on this site checks.
 * So every level is worded as what the certificate says, and the screen that shows one also says,
 * visibly, that it was not checked (SignatureLevel.svelte).
 *
 * Plain names first. The EU's terms — QES, AdES/QC — are the worked example, given in the ⓘ:
 * no user-facing statement may be true only inside the EU.
 */

export type SignatureLevel = 'qualified' | 'qualified-certificate' | 'certificate';

export interface CertificateStatements {
  /** The certificate says it is qualified. */
  readonly qualified: boolean;
  /** The certificate says its key is kept on a certified signing device. */
  readonly onQualifiedDevice: boolean;
}

export function signatureLevel({ qualified, onQualifiedDevice }: CertificateStatements): SignatureLevel {
  if (qualified && onQualifiedDevice) return 'qualified';
  if (qualified) return 'qualified-certificate';
  return 'certificate';
}

export interface LevelText {
  /** 3, 2 or 1 of three steps. */
  readonly rank: 1 | 2 | 3;
  readonly title: string;
  /** One line under the title: what the certificate says. */
  readonly line: string;
  /** The EU's name for it, for the ⓘ. */
  readonly eu: string;
}

export const LEVELS: Readonly<Record<SignatureLevel, LevelText>> = {
  qualified: {
    rank: 3,
    title: 'Qualified signature',
    line: 'The certificate says it is qualified, and that the key is kept on a certified signing device.',
    eu: 'In the EU, both together make a qualified electronic signature (QES).',
  },
  'qualified-certificate': {
    rank: 2,
    title: 'Advanced signature with a qualified certificate',
    line: 'The certificate says it is qualified, but not that the key is kept on a certified signing device.',
    eu: 'In the EU, this is an advanced signature with a qualified certificate (AdES/QC) — not a qualified electronic signature (QES), which needs the device as well.',
  },
  certificate: {
    rank: 1,
    title: 'Signature with a certificate',
    line: 'The certificate does not say it is qualified.',
    eu: 'In the EU, a qualified electronic signature (QES) needs a qualified certificate and a certified signing device; this certificate claims neither.',
  },
};

/** The limit that stays on screen wherever a level is shown. */
export const NOT_CHECKED = 'Read from the certificate itself, not checked against an official trust list.';
