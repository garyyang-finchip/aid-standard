# Provisional → final: a vector from a real disputed oracle market

`oracle-dispute-{open,overdue,final}.json` run a `provisional` facet with `finalizeBy` / `finalizationRef`, and the `final` facet that supersedes it, through the reference resolver. The facts behind both facets are those of one real optimistic-oracle market on Polygon, which was proposed, disputed twice, sent to the DVM, reset and then resolved.

- **Public chain data only.** `oracle-dispute-facts.json` lists each transaction, block, block time and decoded log used. `node scripts/oracle-dispute-check.js [--polygon <rpc>] [--ethereum <rpc>]` reads every one of them again from public RPCs (archive log access needed). The facet content documents are carried in each fixture under `content` and are built from those facts only, so every facet `digest` equals `keccak256(JCS(content))`.
- **Fixture values.** These are the issuer (`0x4444…`, as in the other supersession fixtures), its declared log, and its commitment times: each commitment is set to the block time of the chain event it reports plus 60 s, and is supplied through `trustedTimestamps` / `provenAt` as in the other fixtures. No issuer's real record is used.
- `node scripts/fixtures-oracle-dispute.js` regenerates the three fixtures from the facts file. The test is in `test/run.js`.

## The market (all times UTC, 2026)

Question id `0x30eb…2791` = `keccak256(ancillaryData)`; condition id `0x4ba3…c734` = `keccak256(adapter ‖ questionId ‖ 2)`. "Iran closes its airspace by May 24?": the deadline in the ancillary data is "by the listed date, 11:59 PM ET", that is 05-25 03:59:00 (`1779681540`).

| step | chain | when | tx | what the chain shows |
|---|---|---|---|---|
| initialize | 137 | 05-12 15:06:29 | `0x323e036a…4bfc` | `QuestionInitialized`, `RequestPrice` (request 1) |
| propose-1 | 137 | 05-22 21:41:36 | `0x2998c70f…1dce` | `ProposePrice` Yes (`1e18`) |
| dispute-1 | 137 | 05-22 23:26:52 | `0x537d7b36…0752` | `DisputePrice`; adapter `QuestionReset`, `RequestPrice` (request 2) |
| propose-2 | 137 | 05-22 23:27:37 | `0xc05dae30…b811` | `ProposePrice` Yes |
| dispute-2 | 137 | 05-22 23:37:20 | `0x8281a9d5…897a` | `DisputePrice`; request bridged to the DVM |
| vote request | 1 | 05-23 00:15:35 | `0xc5d7f78c…ba19` | VotingV2 `RequestAdded`, round 10299, `time` 1779492457, `ancillaryDataHash:57489c…` |
| vote round end | 1 | 05-27 00:00:00 | (view) | `getRoundEndTime(10299)` = 1779840000 |
| vote resolved | 1 | 05-27 00:00:23 | `0x7c155ad1…921c` | `RequestResolved`, price = int256 min (ignore price: "too early") |
| price pushed | 137 | 05-27 00:26:33 | `0x2833528c…9b74` | child oracle `PushedPrice` (state sync) |
| reset + propose-3 | 137 | 05-27 00:28:03 | `0x32afb206…fc28` | `resolve` reads the ignore price, adapter `QuestionReset`, `RequestPrice` (request 3), `ProposePrice` No (`0`), expiry 02:28:03 |
| resolved | 137 | 05-27 03:29:12 | `0x3410d510…152a` | `QuestionResolved` price 0, CTF `ConditionResolution` payouts `[0, 1]` |

`ancillaryDataHash:57489c…` in the Ethereum request is `keccak256(ancillaryData ‖ ",ooRequester:65070be9…")`, which ties the vote to this question. The first dispute also raised a DVM request (`0x2729ed0a…a138`, resolved in the same transaction). The adapter does not wait on that one.

## The facets and what the resolver reports

Both facets have `facetType` `aid:outcome/oracle/v1`, the same issuer, and the same `subjectWindow` (`from` = initialization, `until` = the deadline). They therefore share one log tag.

- **P** (`provisional`): content state `disputed`, both Yes proposals, the vote request. `finalizeBy` = 1779840000 (end of round 10299), `finalizationRef` = the question id.
- **F** (`final`): content state `resolved`, outcome No, payouts `[0, 1]`, the vote result (`too-early`), the third proposal and the resolution tx. `supersedes` = P.

| fixture | `now` | log holds | expected |
|---|---|---|---|
| `oracle-dispute-open.json` | 05-25 12:00 (vote running) | P | P current, `provisional`, `finalization: open`, `timing: pre-outcome` |
| `oracle-dispute-overdue.json` | 05-27 01:00 (round over, question re-proposed, not final) | P | P current, `provisional`, `finalization: overdue` |
| `oracle-dispute-final.json` | 05-28 00:00 | P, F (`supersedes` P) | F current, `final`, `integrity-only` (committed after the deadline). P history, `supersededBy` F, `supersessionTiming: not-before-outcome`, not `reversedAfterOutcome` (provisional) |

The test also drops F from the subject's Document in the final snapshot. P is then still history ("superseded in issuer log") and is not reported overdue.

The `overdue` row is what the real timeline produces when `finalizeBy` is the vote's end. The vote ended on time, but its result was "too early", so the market was re-proposed and only became final 3 h 29 min later.
