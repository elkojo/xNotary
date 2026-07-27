# M0 spike fixtures

Provenance of the files in this directory. They are third-party artifacts used
only to prove that xNotary's parsing agrees with the reference implementations.

## `reference.txt` / `reference.ots`

Upstream OpenTimestamps example, fetched from
<https://github.com/opentimestamps/javascript-opentimestamps/tree/master/examples>
(`hello-world.txt`, `hello-world.txt.ots`).

Chosen because its Bitcoin attestation is already anchored, so the upgrade and
blockchain-verification legs of the spike do not have to wait ~1h for a fresh
calendar submission to be included in a block.

`reference.txt` SHA-256: `03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340`

## `signed-sample.pdf`

See `docs/m0-spike.md` — a PAdES-signed PDF is needed to exercise signer
identity extraction. Not committed if it contains real personal data.
