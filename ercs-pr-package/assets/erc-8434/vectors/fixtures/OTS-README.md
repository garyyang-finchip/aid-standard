# `committedAt` with anchor `ots`: a real Bitcoin-anchored fixture

`ots-timing.json` runs a real OpenTimestamps proof through the reference resolver and gives the three timing outcomes `timingOf` defines.

- **Facet digest** `0x1895ccf6a8cc5412f64e7272690997b0837bfcdfdab803281f52cfe60471f74d` = `keccak256(JCS(ots-facet-content.json))`. The content is a forward verdict, published before its outcome at https://api.babyblueviper.com/ledger/270.
- **Stamp**: submitted 2026-10-01T11:34:41Z to four public calendars; confirmed in Bitcoin block 969451 (header timestamp 1790863234 = 2026-10-01T14:20:34Z).
- **Offline**: `ots-proof.json` carries the `.ots` file (base64) and the 80-byte header of that block, pinned by `blockHash`. Anyone can check the block against any explorer. No network is used by the check.

| facet | `subjectWindow.until` | digest | expected `timing` |
|---|---|---|---|
| `aid:tasks/erc8414/v1` | 2026-12-31T23:59:59Z | the stamped digest | `pre-outcome` (`committedAtVerified` 1790863234) |
| `aid:review/erc8004/v1` | 2026-09-30T00:00:00Z | the stamped digest | `integrity-only`, "committed after subjectWindow.until" |
| `aid:skills/erc8338/v1` | 2026-12-31T23:59:59Z | a different digest | `integrity-only`, "commitment not verified" |

The verifier is `tools/aid-resolve/verifiers/ots.js` (Node stdlib only), plugged in as `ctx.verifiers.ots`. It checks that the stamped digest equals the facet digest, that `sha256d(header)` reversed equals `blockHash`, and that some path of the timestamp tree ends in a Bitcoin attestation whose message equals the header's merkle root. A pending-only proof returns null, so the resolver reports `integrity-only` until the calendar transaction confirms.

`node scripts/ots-timing-check.js` runs the three outcomes and six mutations that must all be refused: a flipped header byte, an altered block hash, an altered merkle root with a recomputed block hash (only the path-to-root check can refuse that one), a truncated `.ots`, a flipped byte in the path, and a missing proof. `node scripts/fixtures-ots.js` regenerates `ots-timing.json`.
