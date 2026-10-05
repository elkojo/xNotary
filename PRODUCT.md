# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individuals and small firms: freelancers, small businesses and private people who sign or keep
contracts and want proof of them, without a notary visit, a platform account or an upload. They
use it occasionally, so every screen has to make sense to someone seeing it for the first time.
Nothing on it may contradict what a lawyer or a validator would check.

## Product Purpose

xNotary.digital is a family of document tools that run entirely in the visitor's browser:

- **xNotary** proves that an exact file existed no later than a given Bitcoin block (Certificate 1),
  and later names who signed it, from the signatures themselves (Certificate 2).
- **xSignature** makes a signature image, signs a PDF with the visitor's own certificate, and checks
  a signed PDF.
- **xConvert** converts documents between formats, and to archival PDF/A by default.

Success means the visitor leaves with a file that proves something, and the proof checks out with
independent tools, without this site.

## Positioning

The site holds nothing. The document never leaves the device: only a 32-byte digest is sent,
to public OpenTimestamps calendars. There is no backend, no account and no database. Every
result can be verified without xNotary. A notarization service that never held the document
cannot leak it, lose it or be compelled to hand it over.

## Operating Context

- Contracts and other documents, in DOCX, ODT, PDF, Markdown and the like, are often signed by
  several people, one after another or in parallel. Signatures may come from a qualified trust
  service provider (in the EU, under eIDAS) or from the signer's own certificate.
- Outputs are files the visitor saves and keeps: the certificate PDFs, `.ots` proofs, signed PDFs
  and converted documents. The downloaded file is the real copy. Browser storage is a
  convenience scoped to one origin.
- Verification happens elsewhere: the reference `ots` client, DSS, or a trust provider's
  validator.

## Capabilities and Constraints

- Static site only (Cloudflare Pages). Anything that needs a server, including a proxy, is out.
  A strict Content-Security-Policy is set per service in `app/hub/public/_headers`.
- The interface is in English. Documents and signer names are often Czech (ř ě č ů ť ň ď), and
  any name in any script must render correctly on screen and in certificates.
- The audience is worldwide. The EU and eIDAS are the worked example, never the frame: no
  statement may be true only inside the EU.
- "Notarization" is the product's name, not a legal claim. No copy may suggest it replaces an
  officially verified signature (in Czech, *úřední ověření*).
- The site reports claims, never verdicts: it does not decide whether a signature is legally
  qualified.
- Public beta: no security review and no legal review yet. The site says so.

## Brand Commitments

- Name: xNotary.digital, with the services xNotary, xSignature and xConvert. Each has an
  "x"-diamond mark, and all share one top bar.
- The black-on-yellow scheme is binding: ink on warm paper, a yellow highlighter accent, and a
  dark bar with a yellow rule.
- Voice: plain, exact and modest. It says what is proven and what is not, states the limit
  before the benefit, and never oversells. Screens carry the minimum. Explanations sit behind
  an ⓘ, but a limit the product requires stays visible as one sentence.

## Evidence on Hand

- Real outputs: Certificate 1 and Certificate 2 PDFs, `.ots` proofs anchored in Bitcoin, and
  PDF/A files that veraPDF validates.
- Measurements of real qualified signatures are in `docs/qtsp-findings.md`.
- The site has no testimonials, customers, usage figures or press. Never invent any.

## Product Principles

1. The document never leaves the device. Convenience never earns an upload.
2. Never claim more than was verified, whether about a timestamp, a signature or who signed.
3. Every result stands on its own and verifies without this site.
4. State the limit next to the promise, briefly. Silence is read as a claim.
5. Build for the occasional visitor. Nothing may require knowing what a hash or a PAdES
   signature is.

## Accessibility & Inclusion

WCAG 2.2 AA across every service: text contrast, keyboard use, visible focus, 24px minimum tap
targets, and reduced motion. Names in any script must render correctly.
