# ERC-8434 — #29 (babyblueviper1, aid-standard#4), aid-standard#3 (predge-ai), #30 (priors-agents), 2026-10-22

Thread: https://ethereum-magicians.org/t/erc-8434-agent-identity-aid/29805

## Reply to #29 (post after aid-standard#4 is merged)

@babyblueviper1 Merged, both commits. The four commands exit 0 from a fresh clone here as well, and the resolver reports facet 1 as history with `supersessionTiming: not-before-outcome` and `reversedAfterOutcome: true`, facet 2 as current, integrity-only — the same as the run in #28. §8 and the supersession-timing rule now have a live third-party case on Sepolia, pinned at 11944211, beside the vectors.

The script fix stays, with thanks. You were right on both counts: `ots-timing-check` never handed the issuer's declared log to the resolver, so a facet that names a log could only ever come out `undeclared` — which means the rule this example exists to exercise was unreachable from that script — and the flipped-path-byte mutation could land on a pending branch and prove nothing. Both are now fixed on the Bitcoin-attested path, and the original fixture still passes 9/9. The README credits the example and the fix.

## Review of aid-standard#4 (done 2026-10-22)

- Seven files fetched at head 9be5f7d and overlaid on current `main`: `npm test` 34/34, `npm run ots-check` ALL PASS, `node scripts/sepolia-replay.js --manifest examples/sepolia-commitment-log/manifest.json` matches both `resolved-B.json` and `resolved-issuer.json`, `node scripts/ots-timing-check.js examples/sepolia-commitment-log/ots-fixture.json` ALL PASS (7/7), and the default replay still matches `deployments/sepolia/`.
- `resolved-B.json`: document digest `0x03b454c0…1019` (the Document published at block 11944210), facet 1 history / `not-before-outcome` / `reversedAfterOutcome: true` / `digestAlg: sha256`, facet 2 current / `integrity-only`.
- Script fix (9be5f7d): (1) passes `issuerLogs` / `logEntries` from the fixture into the resolver; (2) replaces the hard-coded `b[100] ^= 1` mutation with `bitcoinPathByte()`, a small parser of the OTS binary that finds an operand byte on the path ending in the Bitcoin attestation (`0588960d73d71901`). Read in full; correct and minimal (+15/−2).
- No product name in the seven files; issuer data referenced by URI only; `README.md` untouched by the PR (credit lines added by us after merge).
- Merge as squash with message: `Sepolia commitment-log example with a late supersession; ots-timing-check reads the issuer log and mutates the Bitcoin-attested path (contributed by @babyblueviper1)`.

## aid-standard#3 (predge-ai): comment to post on the PR

Thanks for the vector, and sorry for the wait. Verified from a fresh clone against current `main`: the three fixtures resolve as your `expect` blocks say, every content digest is `keccak256(JCS(content))`, `fixtures-oracle-dispute.js` regenerates them byte-identically, and I spot-checked the Polygon initialisation and resolution receipts, the Ethereum `RequestResolved` receipt and `getRoundEndTime(10299)` against public RPCs; all match the facts file. On the four questions:

1. Yes: `finalizeBy` is the end of the DVM round, and `overdue` during the re-proposal is the intended reading — the issuer's promised finalization time has passed and no conclusion has arrived. Once the final facet supersedes it, the provisional one becomes history.
2. `finalizationRef` names the question id; put the DVM request in `content`. The reference exists so a relying party can find where the final answer will appear, and the question id is the identifier that survives re-proposals.
3. The facet-type grammar in §7 is `aid:<segment>(/<segment>)*/v<N>`, and `aid:behavior/<name>/v<N>` is the open namespace for types the spec does not define, so a type outside `aid:` is not valid and `aid:outcome/…` would claim a core type that does not exist. Please use `aid:behavior/oracle-outcome/v1` (an agent's answers to oracle questions are its behaviour); the resolver treats it identically. A general extension namespace for non-behaviour types, and whether a core outcome type is worth defining, are on the list for the next text revision.
4. Keep `subjectWindow`: for an outcome facet it is the market's interval from open to resolution, and the log tag is computed over it, so dropping it would put the provisional and final facets under different tags and break the supersession chain.

Two mechanical points before merging: the branch is based on an older `main` (the Sepolia deployment, R2.9's `digestAlg` and a Contributors section have landed since), so please rebase; and the fixtures stay under `assets/erc-aid/vectors/fixtures/` like the OTS ones, but they are not copied into the ERC filing package. The README will credit the vector.

## Reply to #30 (priors-agents)

@priors-agents Welcome, and yes, please open the thread; here is how the two fit from this side.

1. That is the intended use of the facet model. A type in the open namespace (`aid:behavior/<name>/v1`; a general extension namespace is on the list for the next revision) whose content points at the statements, with `subjectWindow` set to the statement's window and `observedAt` to its end, is exactly what the Document is for; the resolver classifies it like any other facet. One boundary to keep explicit: listing the facet in an AID Document attests that the statement is in-interval and current or historical for that anchor, not the figures themselves — those stand on the Merkle root, which is the right place for them.
2. You are right that a mean of cumulative figures is not income. Rather than teach `aid:review/erc8004/v1` about cumulative tags, I would keep that facet to score-like feedback, say so in the next text revision, and have cumulative tags such as `revenues` reach the Document through the dedicated facet in your point 1, where "latest per writer" is the natural reading.
3. Agreed, and you read the ERC-8004 text correctly: it guarantees the `MetadataSet` for `agentWallet` at registration and says a transfer clears the wallet, but it does not say that `setAgentWallet` or the clearing emit the event — the reference registry does, and AID's resolver relies on it (the Sepolia intervals were rebuilt from exactly those logs). AID's next revision will state that dependence as an explicit requirement on the bound registry, and I am happy to co-sign a request to the ERC-8004 authors that every wallet change emit `MetadataSet`; if you draft it, I'll add AID's dependence as a second case.

## Decisions

| # | Decision |
|---|---|
| A1 | aid-standard#4: merge both commits (squash, message above); README credit lines (examples entry + Contributors) applied after the merge. |
| B1 | #3 Q1 `finalizeBy` = DVM round end; `overdue` during re-proposal is the intended reading. |
| B2 | #3 Q2 `finalizationRef` = question id; DVM request in content. |
| B3 | #3 Q3 namespace: `aid:` grammar is normative (§7); extension types use `aid:behavior/<name>/vN` today; a general extension namespace and a possible core outcome type are candidates for the next text revision. Fixture type → `aid:behavior/oracle-outcome/v1`; rebase required; fixtures stay under `assets/erc-aid/vectors/fixtures/` (OTS precedent) and are excluded from the filing package. |
| B4 | #3 Q4 keep `subjectWindow`. |
| C1 | #30 Q1 yes (same namespace answer as B3). |
| C2 | #30 Q2 option (b): `aid:review/erc8004/v1` stays score-like; cumulative tags via a dedicated facet; one sentence in the next text revision. |
| C3 | #30 Q3 both: explicit registry requirement in AID's next revision + co-sign a request to ERC-8004. His repository name says ERC-8458 but no assignment was confirmed; the reply does not use the number. |
| D | Next text revision (R2.10) candidates collected: general extension namespace `aid:x/<vendor>/<name>/vN`; review facet scope sentence; registry `MetadataSet` requirement; possibly a core outcome type. |
