# The GitHub Pages redirect stub

This directory is what `https://elkojo.github.io/xNotary/` serves. It is not the app.

xNotary is hosted at <https://xnotary.digital>, and that is the only production instance.
This origin used to serve a full copy, which meant two live deployments that could drift apart
and two answers to "which one is real". `deploy.yml` publishes this stub instead, so an old
bookmark lands on the canonical address rather than on a build nobody is updating.

`404.html` is generated from `index.html` at deploy time so that a path under `/xNotary/`
redirects as well as the root does — the workflow copies the file rather than this directory
carrying two identical ones.

**What this does not carry across.** Certificates in *My certificates* live in IndexedDB, which
the browser scopes to an origin. Anything saved while the app was served from
`elkojo.github.io` stays in that browser under that origin, and does not appear on
`xnotary.digital` — no copy of it ever existed anywhere else. The downloaded Certificate 1 PDF
is the real copy, and it verifies with the reference `ots` client without xNotary at all.
