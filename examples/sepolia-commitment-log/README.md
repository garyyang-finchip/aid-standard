# Sepolia: a third-party issuer's commitment log and a late supersession

A recorded resolver run of anchor B's Document from block 11944210 on, where B lists two `ATTESTED` facets from a third-party issuer, `eip155:11155111:0x4AA351E5f00eBe168E5C6f823f2940553d164991`. The issuer declared a commitment log in its own AID Document before the facets' `subjectWindow.until`. It wrote a `final` verdict as log entry 1 before `until`, and then superseded it with entry 2 after `until`. Both log heads and both facet digests are anchored with OpenTimestamps in Bitcoin.

The rule this case exercises is §11 step 7, supersession timing. A claim made in time and withdrawn after the outcome must be reported as such.

## Reproduce

```
node scripts/sepolia-replay.js --manifest examples/sepolia-commitment-log/manifest.json
node scripts/ots-timing-check.js examples/sepolia-commitment-log/ots-fixture.json
```

No network is needed for either command.

## What the resolver reports

**Anchor B** at block 11944211 (timestamp 1792364640, B's heartbeat after the Document update):
- Facet 1 (digest `0x71b3…57d2`) is history, with `reason: superseded`, `timing: pre-outcome` and `supersessionTiming: not-before-outcome`. It also carries `reversedAfterOutcome: true`.
- Facet 2 (digest `0xbd10…239c`) is current and `integrity-only`, because it was committed after `until`.
- The identity facet is unchanged from the reference example.

**Issuer anchor** is `DORMANT`, with no binding and no facets. Its Document carries only the `commitmentLog` declaration (`declaredAt` 1792282956), set in tx `0xe0fea7292a0d0c79fe8968be72de81f0db55f8f7cc3dd76b8fa6ddd5257401fb`, block 11937503.

| Item | Time (unix) | Bitcoin block |
|---|---|---|
| log declared (issuer Document) | 1792282956 | — |
| facet 1 digest, OTS | 1792284238 | 971925 |
| head 1 (entry 1), OTS | 1792283781 | 971924 |
| `subjectWindow.until` | 1792311756 | — |
| head 2 (entry 2, supersedes entry 1), OTS | 1792315510 | 971967 |
| facet 2 digest, OTS | 1792316888 | 971970 |

## Files

- `manifest.json`: the `deployments/sepolia.json` shape. It names anchors `B` and `issuer`, pins the block timestamp, and sets `verifiers: ["ots"]`. `ctx` hands the resolver the issuer's declared log (`issuerLogs`) and the log in the resolver's `logEntries` form (`tag`, `content`, `supersedes`, `provenAt`, `anchor`). `provenAt` is each head's Bitcoin block time.
- `rpc-replay.json`: every JSON-RPC response the resolver requested for both anchors, with `latest` served as block 11944211. It was recorded against `sepolia.gateway.tenderly.co`. All 18 point reads (`eth_call`, `eth_getBlockByNumber`) return identical results at that block from `sepolia.drpc.org`. The 6 `eth_getLogs` ranges exceed drpc's free-plan limit and were not cross-checked.
- `resolved-B.json`, `resolved-issuer.json`: `{snapshot, resolved}` for each anchor, as `sepolia-replay.js` compares them.
- `ots-fixture.json`: a reconstructed view as of log head 1. It is B's Document as recorded, keeping only facet 1, with the issuer log read through entry 1. It judges facet 1's own OTS proof (`pre-outcome`, `exclusivity: unique`, `committedAtVerified` 1792284238), and the check's mutations must knock it back to `integrity-only`. B's Document never held facet 1 alone on chain. The full resolution, where facet 1 is history, is `resolved-B.json`.

## Issuer data, by reference

These files are hosted by the issuer and are not copied here:
- the facet contents (`facet-1.json`, `facet-2.json`, whose `sha256` of JCS content equals each facet's `digest`, declared with `digestAlg: "sha256"`)
- the signed log (`log.json`, holding heads, head signatures, and head OTS proofs with block headers)
- the issuer Document
- the build script

They are at https://github.com/babyblueviper1/preaction-governance-conformance/tree/main/examples/aid-commitment-log, alongside the recorder used for `rpc-replay.json`.

The issuer's anchor key is used only for this example. It holds test ETH only.
