# ERC-8434 Magicians replies — round 5 close-out (2026-10-09)

Thread: https://ethereum-magicians.org/t/erc-8434-agent-identity-aid/29805 · PR: ethereum/ERCs#2044

Post after the R2.8 commit on #2044 is green, as a reply to the thread (not to a single post). Section numbers cited are those of the PR text (`erc-8434.md`).

---

## Summary reply (thread-level)

Revision 2.8 is in #2044, covering what this round raised: the supersession-timing rule and the *Late supersession* note (thanks @babyblueviper1, aid-standard#2), `finalizeBy` / `finalizationRef` with `open` / `overdue` reporting (thanks @predge-ai), and the mutual-link rule for `alsoKnownAs` (thanks @wjmelements). The Rationale now ends with acknowledgements for the contributions from this thread, and the aid-standard README credits the `ots` verifier and the supersession-timing code.

---

## Decisions taken

| # | Decision |
|---|---|
| 1 | PR #2 (babyblueviper1) squash-merged, code only; its resolver logic, fixture and test are carried unchanged into R2.8. |
| 2 | `finalizeBy` is schema-valid only on `provisional` facets (`if`/`then`); the resolver ignores it on a `final` facet. `finalizationRef` is opaque to the core. |
| 3 | `finalization: overdue` is never reported for a facet the issuer's log shows superseded (that facet is history). Resolver adds `finalizationReason` when it could not check a log. |
| 4 | `alsoKnownAs` links reported per link as `confirmed` / `unconfirmed` / `unchecked`; a one-sided link never merges profiles (§1 + Security *Cross-chain impersonation*). Fixture mode reads `linkedDocuments`; RPC mode may supply `ctx.fetchLinkedDocument`. |
| 5 | Acknowledgements placed as the last Rationale paragraph (no new `##` section). SergeevDmitry credited for raising the lost-key recovery case (post #6) that the takeover rule covers — the takeover rule itself came from the reply to chugarchugarr (post #5). wjmelements credited for prompting the mutual-link rule. |
| 6 | README gains a Contributors section crediting babyblueviper1 for aid-standard#1 and #2. |

## Changes landed in R2.8

- Spec: §1 mutual-link rule; §6 `finalizeBy` / `finalizationRef` + finalization paragraph; §8 proven time of a superseding entry; §11 steps 7, 10, 11; Rationale acknowledgements; Security *Late supersession*, *Cross-chain impersonation*; Test Cases paragraph.
- Assets: `facet.schema.json`; `resolve.js` (`finalizationOf`, `alsoKnownAsOf`, `alsoKnownAs` in the report); fixtures `supersession-timing.json` (PR #2), `finalization.json`, `also-known-as.json`.
- Tests 31 → 33 (`finalization`, `alsoKnownAs`).
