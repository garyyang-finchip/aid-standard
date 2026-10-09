// Build resolver fixtures from the generated vectors (run after scripts/vectors.js).
const fs = require("fs");
const path = require("path");
const v = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "erc-aid", "vectors", "aid-vectors.json")));
const doc = v.aidDocument.document;
const base = {
  aid: doc.aid, state: 1,
  binding: { registry: v.inputs.identityRegistry, agentId: v.inputs.agentId, boundAt: 1790000000 },
  lastSeen: 1790000000, livenessWindow: 7776000, successor: null,
  documentDigest: v.aidDocument.digest, document: doc, onChainFacets: {},
  registrationFile: { type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", name: "demo-agent", description: "fixture", image: "", active: true },
};
const dir = path.join(__dirname, "..", "assets", "erc-aid", "vectors", "fixtures");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "active.json"), JSON.stringify(base, null, 2));
fs.writeFileSync(path.join(dir, "active-flag-false.json"), JSON.stringify({ ...base, registrationFile: { ...base.registrationFile, active: false } }, null, 2));
fs.writeFileSync(path.join(dir, "retired.json"), JSON.stringify({ ...base, state: 3, successor: "0x2222222222222222222222222222222222222222" }, null, 2));
fs.writeFileSync(path.join(dir, "bad-digest.json"), JSON.stringify({ ...base, documentDigest: "0x" + "00".repeat(32) }, null, 2));
// authority-interval gap: A bound -> relation left (gap) -> relation returned (new interval)
const agentKeyed = (obs) => ({ facetType: "aid:review/erc8004/v1", provenance: "ATTESTED", issuer: doc.aid, validUntil: 1799000000, observedAt: obs, digest: "0x" + "00".repeat(32), access: { mode: "PUBLIC" }, resolver: { kind: "erc8004-reputation", chainId: 11155111, registry: "0x0000000000000000000000000000000000008004", agentId: v.inputs.agentId, tag1: "*" } });
const addrKeyed = { facetType: "aid:skills/erc8338/v1", provenance: "OBSERVED", issuer: doc.aid, validUntil: 1799000000, observedAt: 1790700000, digest: "0x" + "00".repeat(32), access: { mode: "PUBLIC" }, resolver: { kind: "erc8338", chainId: 11155111 } };
const gapDoc = { version: "aid-document/v1", aid: doc.aid, binding: doc.binding, facets: [agentKeyed(1790700000), agentKeyed(1791100000), addrKeyed] };
const { canonicalize } = require("../tools/jcs"); const { ethers } = require("ethers");
fs.writeFileSync(path.join(dir, "interval-gap.json"), JSON.stringify({ ...base, document: gapDoc, documentDigest: ethers.keccak256(ethers.toUtf8Bytes(canonicalize(gapDoc))),
  authorityIntervals: [{ from: 1790000000, until: 1790500000 }, { from: 1791000000, until: null }] }, null, 2));
// timing: same facet shape, commitment proven before / after subjectWindow.until (trustedTimestamps stands in for a proof verifier)
const timed = (ft, until) => ({ facetType: ft, provenance: "ATTESTED", issuer: doc.aid, validUntil: 1799000000, observedAt: 1790600000, subjectWindow: { from: 1790000000, until }, committedAt: { anchor: "ots", proof: { ots: "AAE=" } }, digest: "0x" + "11".repeat(32), access: { mode: "PUBLIC" }, resolver: { kind: "erc8414", chainId: 11155111 } });
const timingDoc = { version: "aid-document/v1", aid: doc.aid, binding: doc.binding, facets: [timed("aid:tasks/erc8414/v1", 1790700000), timed("aid:review/erc8004/v1", 1790500000), timed("aid:behavior/core/v1", 1790603600)] }; // third: until inside the 7200 s ots tolerance
fs.writeFileSync(path.join(dir, "timing.json"), JSON.stringify({ ...base, document: timingDoc, documentDigest: ethers.keccak256(ethers.toUtf8Bytes(canonicalize(timingDoc))),
  trustedTimestamps: { "aid:tasks/erc8414/v1": 1790600000, "aid:review/erc8004/v1": 1790600000, "aid:behavior/core/v1": 1790600000 } }, null, 2));
// exclusivity against the issuer-declared commitment log (reference profile)
const { logTag } = require("../tools/aid-resolve/resolve");
const issuer = "eip155:11155111:0x4444444444444444444444444444444444444444";
const LOG = "https://issuer.example.invalid/commitments";
const exFacet = (ft, digest, logUri) => ({ facetType: ft, provenance: "ATTESTED", issuer, validUntil: 1799000000, observedAt: 1790600000, subjectWindow: { from: 1790000000, until: 1790700000 }, committedAt: { anchor: "ots", proof: { ots: "AAE=" }, log: { uri: logUri, position: 7 } }, digest, access: { mode: "PUBLIC" }, resolver: { kind: "erc8414", chainId: 11155111 } });
const D1 = "0x" + "21".repeat(32), D2 = "0x" + "22".repeat(32), D3 = "0x" + "23".repeat(32);
const fUnique = exFacet("aid:tasks/erc8414/v1", D1, LOG), fDup = exFacet("aid:review/erc8004/v1", D2, LOG), fUndeclared = exFacet("aid:behavior/core/v1", D3, "https://other.example.invalid/log");
const exDoc = { version: "aid-document/v1", aid: doc.aid, binding: doc.binding, facets: [fUnique, fDup, fUndeclared] };
const tagOf = (f) => logTag({ ...f, subject: doc.aid });
fs.writeFileSync(path.join(dir, "log-exclusivity.json"), JSON.stringify({ ...base, document: exDoc, documentDigest: ethers.keccak256(ethers.toUtf8Bytes(canonicalize(exDoc))),
  trustedTimestamps: { "aid:tasks/erc8414/v1": 1790600000, "aid:review/erc8004/v1": 1790600000, "aid:behavior/core/v1": 1790600000 },
  issuerLogs: { [issuer]: { uri: LOG, declaredAt: 1789000000 } },
  logEntries: { [LOG]: [{ tag: tagOf(fUnique), content: D1 }, { tag: tagOf(fDup), content: D2 }, { tag: tagOf(fDup), content: "0x" + "ff".repeat(32) }] } }, null, 2));
// supersession: (1) chain in the document, (2) replacement visible only in the issuer log, (3) cross-issuer refused
const OTHER = "eip155:11155111:0x5555555555555555555555555555555555555555";
const S_OLD = "0x" + "31".repeat(32), S_NEW = "0x" + "32".repeat(32);
const outcome = (digest, extra) => ({ facetType: "aid:tasks/erc8414/v1", provenance: "ATTESTED", issuer, validUntil: 1799000000, observedAt: 1790600000, subjectWindow: { from: 1790000000, until: 1790700000 }, committedAt: { anchor: "ots", proof: { ots: "AAE=" }, log: { uri: LOG, position: 9 } }, digest, access: { mode: "PUBLIC" }, resolver: { kind: "erc8414", chainId: 11155111 }, ...extra });
const oldF = outcome(S_OLD, { finality: "provisional" });
const newF = outcome(S_NEW, { finality: "final", supersedes: S_OLD });
const tagS = logTag({ ...oldF, subject: doc.aid });
const logChain = { [LOG]: [{ tag: tagS, content: S_OLD }, { tag: tagS, content: S_NEW, supersedes: S_OLD }] };
const common = { ...base, trustedTimestamps: { "aid:tasks/erc8414/v1": 1790600000 }, issuerLogs: { [issuer]: { uri: LOG, declaredAt: 1789000000 } } };
const mkDoc = (facets) => { const d = { version: "aid-document/v1", aid: doc.aid, binding: doc.binding, facets }; return { document: d, documentDigest: ethers.keccak256(ethers.toUtf8Bytes(canonicalize(d))) }; };
fs.writeFileSync(path.join(dir, "supersession-chain.json"), JSON.stringify({ ...common, ...mkDoc([oldF, newF]), logEntries: logChain }, null, 2));
fs.writeFileSync(path.join(dir, "supersession-hidden.json"), JSON.stringify({ ...common, ...mkDoc([oldF]), logEntries: logChain }, null, 2));
const foreign = outcome(S_NEW, { issuer: OTHER, finality: "final", supersedes: S_OLD, committedAt: { anchor: "ots", proof: { ots: "AAE=" } } });
fs.writeFileSync(path.join(dir, "supersession-cross-issuer.json"), JSON.stringify({ ...common, ...mkDoc([oldF, foreign]), logEntries: { [LOG]: [{ tag: tagS, content: S_OLD }] } }, null, 2));
// supersession timing: six final/provisional pre-outcome facets, each replaced only in the issuer log. The replacement is
// proven (anchored-head time `provenAt`) before the outcome, after it, or not at all; the provisional one is replaced after
// the outcome, which is the expected dispute flow and is not a reversal. Timestamps are keyed by digest.
const T = (n) => "0x" + n.repeat(32);
const stF = (ft, digest, extra) => ({ ...outcome(digest, extra), facetType: ft });
const tB = stF("aid:tasks/erc8414/v1", T("41"), { finality: "final" }), tA = stF("aid:review/erc8004/v1", T("42"), { finality: "final" });
const tU = stF("aid:behavior/core/v1", T("43"), { finality: "final" }), tP = stF("aid:finance/observed/v1", T("44"), { finality: "provisional" });
const tT = stF("aid:skills/erc8338/v1", T("45"), { finality: "final" }); // replacement anchored 1 h before until: inside the 7200 s ots tolerance
const tL = stF("aid:core/kya/v1", T("46"), { finality: "final" }); // itself committed after until (integrity-only): replacing it later is no reversal
const entries = [];
for (const [f, repl, provenAt] of [[tB, T("51"), 1790650000], [tA, T("52"), 1790800000], [tU, T("53"), null], [tP, T("54"), 1790800000], [tT, T("55"), 1790696400], [tL, T("56"), 1790900000]]) {
  const tag = logTag({ ...f, subject: doc.aid });
  entries.push({ tag, content: f.digest }, { tag, content: repl, supersedes: f.digest, ...(provenAt ? { provenAt, anchor: "ots" } : {}) });
}
fs.writeFileSync(path.join(dir, "supersession-timing.json"), JSON.stringify({ ...base, ...mkDoc([tB, tA, tU, tP, tT, tL]),
  trustedTimestamps: Object.fromEntries([tB, tA, tU, tP, tT, tL].map((f) => [f.digest, f === tL ? 1790800000 : 1790600000])),
  issuerLogs: { [issuer]: { uri: LOG, declaredAt: 1789000000 } }, logEntries: { [LOG]: entries } }, null, 2));
// finalization: three provisional facets with finalizeBy, resolved at now = 1791200000. (1) finalizeBy ahead -> open;
// (2) finalizeBy passed, log holds no supersession -> overdue; (3) finalizeBy passed but the issuer log shows a
// supersession -> history (superseded), never overdue. A fourth, final facet with no finalizeBy reports nothing.
const fzF = (ft, digest, extra) => ({ ...outcome(digest, extra), facetType: ft });
const fOpen = fzF("aid:tasks/erc8414/v1", T("61"), { finality: "provisional", finalizeBy: 1791500000, finalizationRef: "req-61" });
const fOverdue = fzF("aid:review/erc8004/v1", T("62"), { finality: "provisional", finalizeBy: 1791100000, finalizationRef: "req-62" });
const fSuperseded = fzF("aid:behavior/core/v1", T("63"), { finality: "provisional", finalizeBy: 1791100000, finalizationRef: "req-63" });
const fFinal = fzF("aid:finance/observed/v1", T("64"), { finality: "final" });
const fzEntries = [];
for (const f of [fOpen, fOverdue, fSuperseded, fFinal]) { const tag = logTag({ ...f, subject: doc.aid }); fzEntries.push({ tag, content: f.digest }); }
fzEntries.push({ tag: logTag({ ...fSuperseded, subject: doc.aid }), content: T("73"), supersedes: fSuperseded.digest, provenAt: 1791050000, anchor: "ots" });
fs.writeFileSync(path.join(dir, "finalization.json"), JSON.stringify({ ...base, ...mkDoc([fOpen, fOverdue, fSuperseded, fFinal]),
  trustedTimestamps: Object.fromEntries([fOpen, fOverdue, fSuperseded, fFinal].map((f) => [f.digest, 1790600000])),
  issuerLogs: { [issuer]: { uri: LOG, declaredAt: 1789000000 } }, logEntries: { [LOG]: fzEntries } }, null, 2));
// alsoKnownAs: three cross-chain links; the linked Documents stand in for a read of the other chain's registry.
// (1) lists this AID back -> confirmed; (2) does not -> unconfirmed; (3) Document not available -> unchecked.
const AKA1 = "eip155:8453:0x65ab82feC38c3A5F2A5b0bd96cB3255E7A45ae42", AKA2 = "eip155:10:0x65ab82feC38c3A5F2A5b0bd96cB3255E7A45ae42", AKA3 = "eip155:42161:0x65ab82feC38c3A5F2A5b0bd96cB3255E7A45ae42";
const akaDoc = { version: "aid-document/v1", aid: doc.aid, binding: doc.binding, alsoKnownAs: [AKA1, AKA2, AKA3], facets: [] };
fs.writeFileSync(path.join(dir, "also-known-as.json"), JSON.stringify({ ...base, document: akaDoc, documentDigest: ethers.keccak256(ethers.toUtf8Bytes(canonicalize(akaDoc))),
  linkedDocuments: {
    [AKA1]: { version: "aid-document/v1", aid: AKA1, alsoKnownAs: [doc.aid], facets: [] },
    [AKA2]: { version: "aid-document/v1", aid: AKA2, alsoKnownAs: ["eip155:1:0x0000000000000000000000000000000000000001"], facets: [] },
  } }, null, 2));
console.log("fixtures written to", dir);
