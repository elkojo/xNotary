# Contributing to xNotary

Thanks for looking. Patches are welcome — bug reports especially, since the parts of this that
matter most are the ones where a wrong answer looks like a right one.

## Sign your commits off (DCO)

Every commit must carry a `Signed-off-by` line:

```bash
git commit -s -m "your message"
```

That line means you certify the [Developer Certificate of Origin](#developer-certificate-of-origin)
below — in short, that you wrote the change or otherwise have the right to submit it under this
project's licence.

**There is no copyright assignment and no CLA.** You keep the copyright in what you write, and it
is licensed to everyone under AGPL-3.0-or-later, the same terms the rest of the project carries.
xNotary is intended to stay open source: the ability to check that the running code does what the
certificates claim is the product, not a marketing position. Paid services may be built *around*
it — archiving, printed certificates, delivery — but they do not require taking the code
proprietary, so nobody is asked to sign away rights to make that possible.

## Before you open a pull request

Everything runs from `app/`:

```bash
npm test          # offline suite — this is what CI runs
npm run check     # svelte-check; must be 0 errors
```

Both must pass. Beyond that:

- **Read the invariants below first.** They are the product, not preferences, and each has tests
  behind it. A change that regresses one will be sent back even if it is otherwise good — most of
  all the two that everything else rests on: the user's file never leaves the device, and nothing
  claims more than was actually verified.
- **New behaviour needs a test.** Fixtures are generated; never assert on fixture bytes, and never
  commit a `.p12` or any PDF signed with a real qualified certificate — a qualified certificate
  carries a real person's name and identifiers that cannot be stripped without breaking the
  signature. See `app/src/lib/fixtures/README.md`.
- **Keep user-facing wording jurisdiction-neutral.** eIDAS is the worked example, never the frame,
  and "notarization" is the product's name, never a legal claim. Invariants 3 and 5 are why both
  matter.
- **No new backend, and no new copyleft dependency** without discussing it first. The one LGPL
  dependency present is linked rather than bundled, deliberately — see `docs/relinking.md`.

Small, reviewable commits with a clear message beat one large one. If you are planning something
substantial, open an issue before writing it.

## Invariants — do not regress these

These are the product, not preferences. Each has tests behind it.

1. **The user's file never leaves the device.** Only a 32-byte digest is transmitted. Nothing
   may upload file contents, not even for convenience.
2. **No backend.** Static SPA only. Anything requiring a server breaks the model — including
   a CORS proxy. If a service needs one, the answer is to drop the service.
3. **Never claim more than was verified.** `OtsStatus` distinguishes `confirmed` (checked
   against an explorer) from `unverified` (attested but unchecked) from `pending` for exactly
   this reason. A status must only be reported when something in the proof evidences it —
   never as a fallback. See `checkStatus` in `src/lib/ots.ts` and `src/lib/ots.test.ts`.
4. **Certificate 1 must verify without xNotary.** The `.ots` is embedded in the PDF and the PDF
   prints the `ots verify` command. Anything that makes the certificate dependent on this app
   defeats the point.
5. **`pades.ts` reports claims, never verdicts.** It cannot say a signature is a valid QES —
   that needs EUTL validation, which the MVP delegates to an external validator. `QualifiedClaim`
   is named that way on purpose.
6. **Signatures from different documents are never pooled.** Parallel signing means one round
   arrives as several files, and listing their signers together asserts they signed the same
   thing. `checkAgreement` establishes that first — from the shared OpenTimestamps proof, or
   failing that the byte-identical base revision — and `buildCertificate2` throws
   `AgreementError` rather than emit a false statement that looks like a true one.
7. **Certificate 2 never modifies the document it attests to.** It embeds the signed PDF as an
   attachment rather than appending a page — appending would push the last signature's ByteRange
   short of the file end, which is precisely the "bytes nobody signed" condition. Nor may it
   name a signer who did not consent, or drop one to save space: it spills to a second page
   instead. See `src/lib/certificate2.ts` and its tests.
8. **A signature is attributed only on evidence.** `matchSignerCert` resolves the signer's
   certificate by issuer *and* serial, or by key identifier — never by picking one out of the
   bundle. Whose name it returns is whose name goes on Certificate 2, so an unresolvable
   SignerInfo is reported as an error. This is invariant 3 applied to identity.

## Developer Certificate of Origin

By making a contribution to this project, I certify that:

**(a)** The contribution was created in whole or in part by me and I have the right to submit it
under the open source license indicated in the file; or

**(b)** The contribution is based upon previous work that, to the best of my knowledge, is covered
under an appropriate open source license and I have the right under that license to submit that
work with modifications, whether created in whole or in part by me, under the same open source
license (unless I am permitted to submit under a different license), as indicated in the file; or

**(c)** The contribution was provided directly to me by some other person who certified (a), (b)
or (c) and I have not modified it.

**(d)** I understand and agree that this project and the contribution are public and that a record
of the contribution (including all personal information I submit with it, including my sign-off)
is maintained indefinitely and may be redistributed consistent with this project or the open
source license(s) involved.

*(This is the Developer Certificate of Origin 1.1, from <https://developercertificate.org/>,
reproduced verbatim.)*
