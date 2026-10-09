Revision after Magicians round 5 ([thread](https://ethereum-magicians.org/t/erc-8434-agent-identity-aid/29805)):

- **Supersession timing (§8, §11)**: a superseding entry's proven time follows the same first-anchored-head rule; the superseded facet keeps its own `timing`; the resolver reports `supersessionTiming` (`before-outcome` / `not-before-outcome` / `unknown`, with per-anchor tolerance) and flags a `final` pre-outcome facet replaced after the outcome as `reversedAfterOutcome`. New security note: *Late supersession*.
- **Finalization deadline (§6, §11)**: optional `finalizeBy` and opaque `finalizationRef` on `provisional` facets (schema-enforced); the resolver reports `finalization: open | overdue`, never `overdue` for a facet the issuer's log shows superseded.
- **Cross-chain links (§1, §11)**: an `alsoKnownAs` link counts only when the linked AID's Document lists this AID back; the resolver reports `confirmed | unconfirmed | unchecked`. New security note: *Cross-chain impersonation*.
- **Acknowledgements** for contributions from the review thread (end of Rationale).
- Assets: facet schema, reference resolver, three new fixtures (`supersession-timing`, `finalization`, `also-known-as`). Test suite 30 → 33.
