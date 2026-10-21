// Oracle-dispute fixtures (run after scripts/vectors.js): one provisional -> final supersession built from a REAL disputed
// optimistic-oracle market. The chain facts are in fixtures/oracle-dispute-facts.json (re-check them with
// node scripts/oracle-dispute-check.js); the facet content documents are built from those facts only, so each facet digest is
// keccak256(JCS(content)) over public data. The issuer, its declared log and its commitment times are fixture values (test issuer
// 0x4444…, commitment = the chain event's block time + 60 s), as in the other supersession fixtures.
//
//   P  provisional: both proposals (Yes) disputed, the second dispute sent to the DVM; finalizeBy = end of DVM round 10299
//   F  final: question resolved No on chain; supersedes P under the same log tag
//
// Three snapshots of what a resolver sees, each with its own `now` and `expect`:
//   oracle-dispute-open.json     2026-05-25T12:00Z  vote running              -> P current, provisional, finalization open
//   oracle-dispute-overdue.json  2026-05-27T01:00Z  round ended, not final    -> P current, provisional, finalization overdue
//   oracle-dispute-final.json    2026-05-28T00:00Z  resolved                  -> F current (final); P history, superseded, not reversed
const fs = require("fs");
const path = require("path");
const { canonicalize } = require("../tools/jcs");
const { ethers } = require("ethers");
const { logTag } = require("../tools/aid-resolve/resolve");
const src = path.join(__dirname, "..", "assets", "erc-aid", "vectors");
const dir = path.join(src, "fixtures");
const v = JSON.parse(fs.readFileSync(path.join(src, "aid-vectors.json")));
const facts = JSON.parse(fs.readFileSync(path.join(dir, "oracle-dispute-facts.json")));
const doc = v.aidDocument.document;
const ev = Object.fromEntries(facts.events.map((e) => [e.step, e]));
const m = facts.market;
const roundEnd = Number(facts.views.find((x) => x.step === "vote-round-end").result);

const base = {
  aid: doc.aid, state: 1,
  binding: { registry: v.inputs.identityRegistry, agentId: v.inputs.agentId, boundAt: 1778000000 },
  lastSeen: 1779000000, livenessWindow: 7776000, successor: null, onChainFacets: {},
  registrationFile: { type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", name: "demo-agent", description: "fixture", image: "", active: true },
};
const issuer = "eip155:11155111:0x4444444444444444444444444444444444444444";
const LOG = "https://issuer.example.invalid/commitments";
const COMMIT_DELAY = 60;

// content documents: public chain facts only
const market = { chainId: 137, adapter: m.adapter, questionId: m.questionId, conditionId: m.conditionId, deadline: m.deadline.unix };
const oracle = { chainId: 137, address: m.oracle, identifier: "YES_OR_NO_QUERY" };
const proposal = (req, prop, disp) => { const pp = prop.logs.find((l) => l.event === "ProposePrice").args;
  return { requestTimestamp: Number(req), proposedPrice: pp.proposedPrice, proposeTx: prop.tx, ...(disp ? { disputeTx: disp.tx } : { expirationTimestamp: Number(pp.expirationTimestamp) }) }; };
const vote = { chainId: 1, voting: m.voting, roundId: 10299, time: 1779492457, ancillaryDataHash: m.dvmAncillaryDataHash, requestTx: ev["vote-request-2"].tx, roundEnd };
const contentP = { market, oracle, state: "disputed", sentToVote: true,
  proposals: [proposal(1778598389, ev["propose-1"], ev["dispute-1"]), proposal(1779492412, ev["propose-2"], ev["dispute-2"])], vote };
const contentF = { market, oracle, state: "resolved", outcome: "No", payouts: ["0", "1"], resolutionTx: ev.resolved.tx,
  proposals: [...contentP.proposals, proposal(1779841683, ev["reset-and-propose-3"])],
  vote: { ...vote, result: "too-early", price: m.ignorePrice, resolveTx: ev["vote-resolved"].tx, pushTx: ev["price-pushed"].tx } };
const digestOf = (c) => ethers.keccak256(ethers.toUtf8Bytes(canonicalize(c)));
const DP = digestOf(contentP), DF = digestOf(contentF);

const facet = (digest, position, observedAt, extra) => ({ facetType: "aid:outcome/oracle/v1", provenance: "OBSERVED", issuer,
  validUntil: 1799000000, observedAt, subjectWindow: { from: ev.initialize.time, until: m.deadline.unix },
  committedAt: { anchor: "ots", proof: { ots: "AAE=" }, log: { uri: LOG, position } }, digest, access: { mode: "PUBLIC" },
  resolver: { kind: "uri", chainId: 137 }, ...extra });
const P = facet(DP, 0, ev["dispute-2"].time, { validUntil: 1780444800, finality: "provisional", finalizeBy: roundEnd, finalizationRef: m.questionId });
const F = facet(DF, 1, ev.resolved.time, { finality: "final", supersedes: DP });
const tag = logTag({ ...P, subject: doc.aid });
if (tag !== logTag({ ...F, subject: doc.aid })) throw new Error("P and F must share a log tag");
const committed = { [DP]: ev["dispute-2"].time + COMMIT_DELAY, [DF]: ev.resolved.time + COMMIT_DELAY };
const entryP = { tag, content: DP };
const entryF = { tag, content: DF, supersedes: DP, provenAt: committed[DF], anchor: "ots" };

const snap = (now, facets, entries, expect) => {
  const d = { version: "aid-document/v1", aid: doc.aid, binding: doc.binding, facets };
  return { ...base, documentDigest: digestOf(d), document: d, now, content: { [DP]: contentP, ...(facets.includes(F) ? { [DF]: contentF } : {}) },
    trustedTimestamps: Object.fromEntries(facets.map((f) => [f.digest, committed[f.digest]])),
    issuerLogs: { [issuer]: { uri: LOG, declaredAt: 1778000000 } }, logEntries: { [LOG]: entries }, expect };
};
const write = (n, o) => fs.writeFileSync(path.join(dir, n), JSON.stringify(o, null, 2));
write("oracle-dispute-open.json", snap(1779710400, [P], [entryP],
  { current: [{ digest: DP, finality: "provisional", finalization: "open", timing: "pre-outcome", exclusivity: "unique" }], history: [] }));
write("oracle-dispute-overdue.json", snap(1779843600, [P], [entryP],
  { current: [{ digest: DP, finality: "provisional", finalization: "overdue", timing: "pre-outcome", exclusivity: "unique" }], history: [] }));
write("oracle-dispute-final.json", snap(1779926400, [P, F], [entryP, entryF],
  { current: [{ digest: DF, finality: "final", timing: "integrity-only", timingReason: "committed after subjectWindow.until" }],
    history: [{ digest: DP, finality: "provisional", reason: "superseded", supersededBy: DF, timing: "pre-outcome", supersessionTiming: "not-before-outcome" }] }));
console.log("oracle-dispute fixtures written; P", DP, "F", DF);
