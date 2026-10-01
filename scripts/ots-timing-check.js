// Runs assets/erc-aid/vectors/fixtures/ots-timing.json through the reference resolver with the OpenTimestamps verifier plugged in,
// then mutates the proof and checks every mutation is refused (timing falls back to integrity-only). No network.   node scripts/ots-timing-check.js
const fs = require("fs");
const path = require("path");
const { resolveSnapshot } = require("../tools/aid-resolve/resolve");
const { verifyOts } = require("../tools/aid-resolve/verifiers/ots");
const { canonicalize } = require("../tools/jcs");
const { ethers } = require("ethers");
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "erc-aid", "vectors", "fixtures", "ots-timing.json")));
const NOW = 1790870000;
let fail = 0;
const chk = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); if (!ok) fail++; };
(async () => {
  const run = async (snap) => { const r = await resolveSnapshot(snap, NOW, { verifiers: { ots: async (f) => verifyOts(f) } }); const m = {}; for (const f of r.facets.current) m[f.facetType] = f; return m; };
  const got = await run(fx);
  for (const [ft, want] of Object.entries(fx.expect)) {
    const g = got[ft] || {};
    const ok = Object.entries(want).every(([k, v]) => g[k] === v);
    chk(`${ft} -> ${want.timing}${want.timingReason ? " (" + want.timingReason + ")" : ""}`, ok, JSON.stringify({ timing: g.timing, timingReason: g.timingReason, committedAtVerified: g.committedAtVerified }));
  }
  // mutations of the proof carried by facet A must never verify
  const mut = async (label, edit) => {
    const s = JSON.parse(JSON.stringify(fx)); const f = s.document.facets.find((x) => x.facetType === "aid:tasks/erc8414/v1"); edit(f.committedAt.proof);
    s.documentDigest = ethers.keccak256(ethers.toUtf8Bytes(canonicalize(s.document)));   // re-hash so ONLY the proof differs, the document still resolves
    const r = (await run(s))["aid:tasks/erc8414/v1"] || {};
    chk(`refused: ${label}`, r.timing === "integrity-only" && r.committedAtVerified === undefined, JSON.stringify(r.timing));
  };
  const flip = (hex, i) => hex.slice(0, i) + ((parseInt(hex[i], 16) ^ 1).toString(16)) + hex.slice(i + 1);
  await mut("block header byte flipped", (p) => { p.blockHeader = flip(p.blockHeader, 80); });
  await mut("block hash altered", (p) => { p.blockHash = flip(p.blockHash, 10); });
  await mut("header merkle root altered AND blockHash recomputed to match (only the path-to-root check can refuse it)", (p) => {
    const h = Buffer.from(flip(p.blockHeader, 80), "hex"); const c = require("crypto");
    p.blockHeader = h.toString("hex"); p.blockHash = Buffer.from(c.createHash("sha256").update(c.createHash("sha256").update(h).digest()).digest()).reverse().toString("hex"); });
  await mut(".ots truncated", (p) => { p.ots = p.ots.slice(0, p.ots.length - 40); });
  await mut(".ots path byte flipped", (p) => { const b = Buffer.from(p.ots, "base64"); b[100] ^= 1; p.ots = b.toString("base64"); });
  await mut("proof missing", (p) => { delete p.ots; });
  console.log(fail ? `\n${fail} FAILED` : "\nALL PASS"); process.exit(fail ? 1 : 0);
})();
