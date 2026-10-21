// Runs assets/erc-aid/vectors/fixtures/ots-timing.json through the reference resolver with the OpenTimestamps verifier plugged in,
// then mutates the proof and checks every mutation is refused (timing falls back to integrity-only). No network.
//   node scripts/ots-timing-check.js                  # the fixture under assets/
//   node scripts/ots-timing-check.js <fixture.json>   # another snapshot of the same shape (document, documentDigest, expect{facetType: {timing, timingReason?}},
//                                                     # optional now, optional mutate: facetType to mutate; default = the first facet with an ots proof)
const fs = require("fs");
const path = require("path");
const { resolveSnapshot } = require("../tools/aid-resolve/resolve");
const { verifyOts } = require("../tools/aid-resolve/verifiers/ots");
const { canonicalize } = require("../tools/jcs");
const { ethers } = require("ethers");
const FX = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "..", "assets", "erc-aid", "vectors", "fixtures", "ots-timing.json");
const fx = JSON.parse(fs.readFileSync(FX));
const NOW = Number.isFinite(fx.now) ? fx.now : 1790870000;
const MUT = fx.mutate || (fx.document.facets.find((x) => x.committedAt && x.committedAt.anchor === "ots" && x.committedAt.proof && x.committedAt.proof.ots) || {}).facetType || "aid:tasks/erc8414/v1";
// Offset of an operand byte on the path that ends in the Bitcoin attestation. A proof stamped on several calendars has other
// branches (pending, or another block); flipping a byte there leaves the Bitcoin path intact and the proof rightly verifies.
function bitcoinPathByte(buf) {
  let i = 31 + 1 + 1 + 32;                                  // magic, version, sha256 op, stamped digest
  const varuint = () => { let v = 0, s = 0, b; do { b = buf[i++]; v += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return v; };
  const one = (tag, trail) => {
    if (tag === 0x00) { const att = buf.subarray(i, i + 8).toString("hex"); i += 8; i += varuint(); return att === "0588960d73d71901" ? trail : null; }
    if (tag === 0xf0 || tag === 0xf1) { const n = varuint(); const at = i; i += n; return node(n ? trail.concat(at + (n >> 1)) : trail); }
    return node(trail);                                     // unary hash op
  };
  const node = (trail) => { let found = null, tag = buf[i++]; while (tag === 0xff) { const r = one(buf[i++], trail); found = found || r; tag = buf[i++]; } const r = one(tag, trail); return found || r; };
  const t = node([]);
  if (!t || !t.length) throw new Error("no operand on the Bitcoin-attested path");
  return t[t.length >> 1];
}
let fail = 0;
const chk = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); if (!ok) fail++; };
(async () => {
  // a facet whose committedAt names an issuer log is judged with that log when the fixture carries it (issuerLogs, logEntries)
  const run = async (snap) => { const r = await resolveSnapshot(snap, NOW, { verifiers: { ots: async (f) => verifyOts(f) }, issuerLogs: snap.issuerLogs || null, logEntries: snap.logEntries || null }); const m = {}; for (const f of r.facets.current) m[f.facetType] = f; return m; };
  const got = await run(fx);
  for (const [ft, want] of Object.entries(fx.expect)) {
    const g = got[ft] || {};
    const ok = Object.entries(want).every(([k, v]) => g[k] === v);
    chk(`${ft} -> ${want.timing}${want.timingReason ? " (" + want.timingReason + ")" : ""}`, ok, JSON.stringify({ timing: g.timing, timingReason: g.timingReason, committedAtVerified: g.committedAtVerified }));
  }
  // mutations of the proof carried by facet A must never verify
  const mut = async (label, edit) => {
    const s = JSON.parse(JSON.stringify(fx)); const f = s.document.facets.find((x) => x.facetType === MUT); edit(f.committedAt.proof);
    s.documentDigest = ethers.keccak256(ethers.toUtf8Bytes(canonicalize(s.document)));   // re-hash so ONLY the proof differs, the document still resolves
    const r = (await run(s))[MUT] || {};
    chk(`refused: ${label}`, r.timing === "integrity-only" && r.committedAtVerified === undefined, JSON.stringify(r.timing));
  };
  const flip = (hex, i) => hex.slice(0, i) + ((parseInt(hex[i], 16) ^ 1).toString(16)) + hex.slice(i + 1);
  await mut("block header byte flipped", (p) => { p.blockHeader = flip(p.blockHeader, 80); });
  await mut("block hash altered", (p) => { p.blockHash = flip(p.blockHash, 10); });
  await mut("header merkle root altered AND blockHash recomputed to match (only the path-to-root check can refuse it)", (p) => {
    const h = Buffer.from(flip(p.blockHeader, 80), "hex"); const c = require("crypto");
    p.blockHeader = h.toString("hex"); p.blockHash = Buffer.from(c.createHash("sha256").update(c.createHash("sha256").update(h).digest()).digest()).reverse().toString("hex"); });
  await mut(".ots truncated", (p) => { p.ots = p.ots.slice(0, p.ots.length - 40); });
  await mut(".ots path byte flipped", (p) => { const b = Buffer.from(p.ots, "base64"); b[bitcoinPathByte(b)] ^= 1; p.ots = b.toString("base64"); });
  await mut("proof missing", (p) => { delete p.ots; });
  console.log(fail ? `\n${fail} FAILED` : "\nALL PASS"); process.exit(fail ? 1 : 0);
})();
