# ERC-8434 — reply to #33 (priors-agents: ERC-8004 request text), 2026-10-23

Thread: https://ethereum-magicians.org/t/erc-8434-agent-identity-aid/29805 · Reply to https://ethereum-magicians.org/t/erc-8434-agent-identity-aid/29805/33 (garyyang-finchip). Post after the R2.10 commit on #2044 is green, so the sentence "now states" is true when read.

## Reply to #33

@priors-agents Here is AID's case for the request, in the shape of your draft; use it as the second paragraph, edit freely.

> **Second dependent: ERC-8434 Agent Identity (AID).** AID binds an address to an ERC-8004 agent and gives that address authority over the agent only while `ownerOf(agentId)` or `getAgentWallet(agentId)` equals the address. Because the relation can change with no AID transaction, AID resolvers reconstruct the *authority intervals* of an address from the registry's own history: `Transfer` for ownership and `MetadataSet(agentId, "agentWallet", …)` for the wallet, with a transfer taken to clear the wallet. Evidence keyed by `agentId` (reputation, validation, the registration file) counts for an address only inside one of its intervals. If a wallet change does not emit `MetadataSet`, the interval is extended past the point where the relation ended and whoever held the agent in that gap inherits the address's attribution — or the reverse. The reference deployment on Sepolia rebuilt its intervals from exactly these events (the official registry does emit on `setAgentWallet` and on the clearing by transfer), and ERC-8434 now states the dependence as a requirement on any bound registry and makes its resolver void an agent's intervals when the live owner or wallet is not explained by the events. A MUST in ERC-8004 would let every reader rely on the registry alone.

Two notes for the request itself: the three cases you list are the complete set as far as AID is concerned (set, unset, cleared by transfer), and it would help readers if the text also said that the clearing on transfer is itself a wallet change for this purpose, since that is the case an implementer is most likely to omit.

On your points 1 and 2: that is how I read them too, and both are now in the ERC text (an open extension namespace `aid:x/<vendor>/<name>/v<N>` beside `aid:behavior/…`, and the review facet limited to score-like feedback with cumulative quantities routed through a dedicated type). Good luck with the thread; I'll follow it.

## Decisions

| # | Decision |
|---|---|
| 1 | AID's dependence paragraph supplied for the ERC-8004 request; Gary's account posts it in the AID thread as the reply to #33, priors-agents carries it into the ERC-8004 thread. No separate post by Gary in the 8004 thread unless asked. |
| 2 | R2.10 lands first so the reply's "now states" is accurate: §3 registry wallet-event requirement + resolver live-relation check (+ test, mock silent setter), §6 `aid:x/` extension namespace and review-facet scope, Security "Silent wallet changes", acknowledgements. |
| 3 | A core outcome facet type is not defined in R2.10; predge-ai's vector uses `aid:behavior/oracle-outcome/v1` (open namespace). Revisit if a second implementer needs the same type. |
