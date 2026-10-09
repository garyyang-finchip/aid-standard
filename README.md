# aid-standard — Agent Identity (AID)

**ERC-8434 — Agent Identity (AID)** (Draft, PR #2044) — address-anchored identity for live agents, layered on ERC-8004 (identity, feedback) and ERC-8419 (KYA / ZK assertions), compatible with ERC-8338 (skills) and ERC-8414 (tasks).

> Any address is a dormant AID. It becomes active when a live agent demonstrably operates behind it.

Status: **ERC-8434 filed (PR #2044). R2.8 — five review rounds incorporated:** authority intervals + stale-binding takeover (chugarchugarr, SergeevDmitry); `subjectWindow` / `committedAt` timing, issuer-declared commitment-log profile, anchor clock tolerance and supersession timing (babyblueviper1); supersession + finality + `finalizeBy` (predge-ai); mutual `alsoKnownAs` links (wjmelements). Optional OTS verifier merged (aid-standard#1), supersession-timing resolver logic merged (aid-standard#2). Not yet deployed to Sepolia.

## Layout

```
ERCS/erc-aid.md                       EIP-1 formatted draft (ERC-8434 (assigned 2026-10-01 in PR #2044))
docs/magicians-post.md                Ethereum Magicians thread text (post first, then fill discussions-to)
ercs-pr-package/                      ready-to-upload file set for the ethereum/ERCs PR (erc-8434 paths, self-contained filing variant) + PR description + checklist
scripts/make-filing-variant.py        regenerates ercs-pr-package/ERCS/erc-8434.md from ERCS/erc-aid.md
LICENSE.md                            CC0-1.0
assets/erc-aid/
  contracts/AIDRegistry.sol           reference registry (no owner, no upgrade, self-contained EIP-712/1271)
  contracts/interfaces/               IAIDRegistry.sol, IERC8004Identity.sol
  contracts/mocks/                    MockIdentityRegistry8004.sol, MockERC1271Wallet
  schemas/                            aid-document, facet envelope, facets/*-v1 content schemas
  vectors/aid-vectors.json            facetType keys, JCS digest, EIP-712 Bind digest, 8419 subjectKey, interfaceId
  vectors/aid-document.sample.json    sample AID Document
  vectors/fixtures/                   resolver fixtures (states, digest, interval gap, timing, log exclusivity, supersession, supersession timing, finalization, alsoKnownAs)
tools/jcs.js                          RFC 8785 canonicalisation used for document digests
tools/aid-resolve/resolve.js          reference resolver (RPC or fixture mode)
scripts/compile.js                    solc-js compile → build/*.json
scripts/vectors.js · fixtures.js      regenerate vectors and fixtures
test/run.js                           behavioural tests on a local Hardhat chain (33 cases)
docs/magicians-replies-*.md           posted replies + decisions per review round
tools/aid-resolve/verifiers/ots.js    optional OpenTimestamps verifier plug-in (contributed; not part of the ERC assets)
```

## Build & test

```bash
npm install
npm run compile      # solc 0.8.28 via solc-js, no network needed
npm test             # deploys to in-process Hardhat network and runs test/run.js
npm run vectors      # regenerates assets/erc-aid/vectors
```

Resolve an anchor:

```bash
node tools/aid-resolve/resolve.js --rpc https://rpc.sepolia.org --registry <AIDRegistry> --anchor <address>
node tools/aid-resolve/resolve.js --fixture assets/erc-aid/vectors/fixtures/active.json --now 1791000000
```

## Design summary

- **Anchor** = `(eip155, chainId, address)`; CAIP-10 string `eip155:{chainId}:{address}`; DID form `did:aid:eip155:{chainId}:{address}` (companion DID method).
- **Binding** to ERC-8004 is strictly one-to-one (anchor ↔ `(identityRegistry, agentId)`), anchor-authorised (direct or EIP-712 `bindWithSig`, EIP-1271 for smart accounts), requiring `agentWallet == anchor` or `ownerOf == anchor`. Recommended anchor: the agent wallet.
- **States**: `DORMANT → ACTIVE ⇄ STALE`, `→ RETIRED` (irreversible, releases the binding, optional successor). On-chain `state()` is fully deterministic; resolvers downgrade with the 8004 registration file's `active` flag.
- **Authority intervals**: a binding confers authority only while its predicate holds; re-establishing it opens a new interval and never authorizes the gap. `agentId`-keyed evidence observed in a gap is not attributable; intervals are reconstructed from `Bound`/`Unbound` + ERC-8004 `Transfer` / `MetadataSet(agentWallet)`. A binding whose predicate has failed can be taken over by the agent's current owner/wallet.
- **Timing** (orthogonal to provenance): optional `subjectWindow` + `committedAt {anchor: block|rfc3161|ots, proof, log?}`; resolver reports `pre-outcome` only when the proven time plus the anchor's clock tolerance (block 12 s, ots 7200 s, rfc3161 stated accuracy) is earlier than `subjectWindow.until`, else `integrity-only`. Informative reference profile: issuer-declared append-only commitment log (`commitmentLog` in the issuer's AID Document) with witnessed, periodically anchored heads; resolver checks exactly-one-entry per `(subject, facetType, subjectWindow)` when it can read the log.
- **Thin layer**: the registry stores only anchor-authorised records (binding, heartbeat, liveness window, document URI, self facets, retirement). Credit, KYA, audits and profiler outputs are ERC-8419 assertions with subject type `account`; raw feedback is ERC-8004 Reputation; skill/task history is derived from ERC-8338/8414 events.
- **Facets** carry provenance (`SELF | OBSERVED | ATTESTED | PROVED`), a mandatory `validUntil`, a digest/commitment and an access mode (`PUBLIC | GATED | ZK`). Financial-behaviour facets default to commitment + ZK predicates.
- **Supersession & finality**: optional `supersedes` (same issuer only; superseded facet is history even inside its window, discoverable from the issuer's log) and `finality: provisional | final` (absent = final; domain state machines live in facet-type schemas). The resolver reports when a supersession was proven (`supersessionTiming`) and flags a final pre-outcome claim replaced after the outcome (`reversedAfterOutcome`). A provisional facet may carry `finalizeBy` (+ opaque `finalizationRef`); the resolver reports `finalization: open | overdue`.
- **Cross-chain links**: an `alsoKnownAs` link counts only when the linked AID's Document lists this AID back; the resolver reports `confirmed | unconfirmed | unchecked`.
- `IAIDRegistry` interfaceId: `0x72750a54`.

## Process rules

- ERCs PR branch: `add-erc-aid`, cut from `ethereum/ERCs` **upstream** master. Never from the fork's master (reserved for PR #1879 / ERC-8338).
- Rounds: R1 memo + skeleton (done) → R2 full text + contracts + schemas + vectors + resolver (done) → R3 Sepolia deployment + worked examples + Magicians thread → R4 ERCs PR + DID method companion.
- Two texts, one design: `ERCS/erc-aid.md` (source; cites ERC-8419/8338/8414 by number, `requires: 8419`) and `ercs-pr-package/ERCS/erc-8434.md` (filing variant; self-contained, no references to still-unmerged proposals, so ethereum/ERCs CI can pass now). The filing variant is generated, never hand-edited. Numbered references are restored by a follow-up PR once #2012 / #1879 / #2005 merge.

## Related

- ERC-8004 Trustless Agents · ERC-8419 Know-Your-Agent (KYA) Framework · ERC-8338 Token-Bound Executable Skills · ERC-8414 Token-Bound Task Tenders
- Sibling repos: `kya-standard`, `task-token-standard`

## Contributors

- `tools/aid-resolve/verifiers/ots.js` and the OpenTimestamps timing fixture: @babyblueviper1 (aid-standard#1)
- Supersession-timing resolver logic and fixture: @babyblueviper1 (aid-standard#2)

Design contributions from the Ethereum Magicians review are acknowledged in the ERC text (Rationale).

## License

CC0-1.0
