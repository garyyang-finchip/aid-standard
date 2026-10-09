Title: Add ERC-8434: Agent Identity (AID)

---

## Summary

Agent Identity (AID) is an address-anchored identity for live agents. Every address is a dormant AID; it becomes active when an [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agent is bound one-to-one to the address, a liveness signal is inside a window, and the agent's own on-chain behaviour exists. The proposal adds a deliberately thin on-chain layer (binding, liveness, retirement, self-declared facet pointers) and composes ERC-8004 (registration, raw feedback) and a minimal *assertion registry* interface (attested / ZK-proved assertions with pinned schemes and expiry) for everything else; skill and task history is derived informatively from token-bound skill and task contracts.

Key elements:

- CAIP-10 identifier `eip155:{chainId}:{address}`; DID form `did:aid:…` in a companion method spec
- Four-state machine `DORMANT → ACTIVE ⇄ STALE`, `→ RETIRED`, with a fully deterministic on-chain `state()` and one explicit off-chain refinement (registration file `active: false`)
- Strict one-to-one binding to `(identityRegistry, agentId)`, anchor-authorised directly or by EIP-712 `bindWithSig` (ERC-1271 for smart accounts)
- AID Document of provenance-tagged (`SELF | OBSERVED | ATTESTED | PROVED`), time-windowed facets with `PUBLIC | GATED | ZK` access; financial-behaviour facets default to commitment + ZK predicates
- Minimal assertion-registry interface (subject encoding, `resolve`/`check`, pinned schemes, ATTESTED/PROVED modes) so the ERC is self-contained; the Know-Your-Agent framework proposal under review here is the reference registry
- Seven-step normative resolution algorithm

## Assets

- `assets/erc-8434/contracts/` — `AIDRegistry.sol` reference implementation (no owner, no upgrade path, self-contained EIP-712 / ECDSA low-s / ERC-1271), interfaces, mocks
- `assets/erc-8434/schemas/` — JSON Schemas for the AID Document, facet envelope and core facet content documents
- `assets/erc-8434/vectors/` — test vectors (facetType keys, JCS digest, EIP-712 Bind digest, `account` subjectKey, interfaceId `0x72750a54`) and resolver fixtures
- `assets/erc-8434/tools/aid-resolve/` — reference resolver

Source repository with the behavioural test suite (33 cases): https://github.com/garyyang-finchip/aid-standard

## Discussion

Ethereum Magicians: https://ethereum-magicians.org/t/draft-erc-agent-identity-aid-address-anchored-identity-for-live-agents-over-erc-8004-assertion-registries/29805

## Notes for editors

The reference assertion registry (Know-Your-Agent framework, PR #2012) and the skill / task-tender proposals (PR #1879, PR #2005) are open in this repository but not yet merged, so this text deliberately does not cite them by number or link. A follow-up PR will add the references and `requires` once they are published.
