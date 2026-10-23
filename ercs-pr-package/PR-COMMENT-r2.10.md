Revision after Magicians round 6 ([thread](https://ethereum-magicians.org/t/erc-8434-agent-identity-aid/29805)):

- **Registry wallet events (§3, §12)**: authority intervals depend on the bound registry emitting `MetadataSet(agentId, "agentWallet", …)` on every wallet change (set, unset, and the clearing on transfer). This is now stated as a requirement on the registry, and the resolver compares the owner and wallet implied by the event history with the live `ownerOf` / `getAgentWallet`; a mismatch voids the agent's intervals and `agentId`-keyed evidence is reported as not attributable. New security note: *Silent wallet changes*.
- **Extension namespace (§7)**: `aid:x/<vendor>/<name>/v<N>` for facet types outside behaviour profiles; a value outside `aid:` is not a valid `facetType`.
- **Review-facet scope (§7)**: `aid:review/erc8004/v1` aggregates score-like feedback only; cumulative quantities belong in a dedicated type read as the latest value per writer.
- Assets: reference resolver (live-relation check), mock registry (test-only silent setter). Test suite 34 → 35. Acknowledgements updated.
