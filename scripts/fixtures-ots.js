// OpenTimestamps `committedAt` fixture (run after scripts/vectors.js): a REAL Bitcoin-anchored proof, three timing outcomes.
// The facet digest 0x1895ccf6…f74d = keccak256(JCS(content.json)) of an invinoveritas forward verdict (ledger #270) that was
// stamped on 2026-10-01T11:34:41Z and confirmed in Bitcoin block 969451 (header timestamp 1790863234). The proof carries the
// 80-byte block header, pinned by its hash, so verification is offline: any explorer can confirm the block independently.
//   a) subjectWindow.until after the block time          -> timing "pre-outcome"
//   b) the same proof, until BEFORE the block time        -> "integrity-only", "committed after subjectWindow.until"
//   c) the same proof, but the facet digest is different  -> "integrity-only", "commitment not verified" (proof is over other bytes)
// Verifier: tools/aid-resolve/verifiers/ots.js, plugged in as ctx.verifiers.ots. Check: node scripts/ots-timing-check.js
const fs = require("fs");
const path = require("path");
const { canonicalize } = require("../tools/jcs");
const { ethers } = require("ethers");
const src = path.join(__dirname, "..", "assets", "erc-aid", "vectors");
const v = JSON.parse(fs.readFileSync(path.join(src, "aid-vectors.json")));
const doc = v.aidDocument.document;
const proof = JSON.parse(fs.readFileSync(path.join(src, "fixtures", "ots-proof.json")));      // { ots (base64), blockHeader, blockHash }
const content = fs.readFileSync(path.join(src, "fixtures", "ots-facet-content.json"), "utf8");
const digest = ethers.keccak256(ethers.toUtf8Bytes(canonicalize(JSON.parse(content))));
const base = {
  aid: doc.aid, state: 1,
  binding: { registry: v.inputs.identityRegistry, agentId: v.inputs.agentId, boundAt: 1790000000 },
  lastSeen: 1790000000, livenessWindow: 7776000, successor: null,
  documentDigest: v.aidDocument.digest, document: doc, onChainFacets: {},
  registrationFile: { type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", name: "demo-agent", description: "fixture", image: "", active: true },
};
const facet = (ft, until, d) => ({ facetType: ft, provenance: "ATTESTED", issuer: doc.aid, validUntil: 1799000000, observedAt: 1790600000,
  subjectWindow: { from: 1790000000, until }, committedAt: { anchor: "ots", proof }, digest: d, access: { mode: "PUBLIC" }, resolver: { kind: "erc8414", chainId: 11155111 } });
const A = "aid:tasks/erc8414/v1", B = "aid:review/erc8004/v1", C = "aid:skills/erc8338/v1";
const facets = [facet(A, 1798761599, digest), facet(B, 1790726400, digest), facet(C, 1798761599, "0x" + "22".repeat(32))];
const d2 = { version: "aid-document/v1", aid: doc.aid, binding: doc.binding, facets };
const out = { ...base, document: d2, documentDigest: ethers.keccak256(ethers.toUtf8Bytes(canonicalize(d2))),
  expect: { [A]: { timing: "pre-outcome", committedAtVerified: 1790863234 },
            [B]: { timing: "integrity-only", timingReason: "committed after subjectWindow.until", committedAtVerified: 1790863234 },
            [C]: { timing: "integrity-only", timingReason: "commitment not verified" } } };
fs.writeFileSync(path.join(src, "fixtures", "ots-timing.json"), JSON.stringify(out, null, 2));
console.log("wrote ots-timing.json; facet digest", digest);
