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

- **Read the invariants in `CLAUDE.md` first.** They are the product, not preferences, and each
  has tests behind it. A change that regresses one will be sent back even if it is otherwise good
  — most of all the two that everything else rests on: the user's file never leaves the device,
  and nothing claims more than was actually verified.
- **New behaviour needs a test.** Fixtures are generated; never assert on fixture bytes, and never
  commit a `.p12` or any PDF signed with a real qualified certificate — a qualified certificate
  carries a real person's name and identifiers that cannot be stripped without breaking the
  signature. See `app/src/lib/fixtures/README.md`.
- **Keep user-facing wording jurisdiction-neutral.** eIDAS is the worked example, never the frame,
  and "notarization" is the product's name, never a legal claim. `CLAUDE.md` explains why both
  matter.
- **No new backend, and no new copyleft dependency** without discussing it first. The one LGPL
  dependency present is linked rather than bundled, deliberately — see `docs/relinking.md`.

Small, reviewable commits with a clear message beat one large one. If you are planning something
substantial, open an issue before writing it.

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
