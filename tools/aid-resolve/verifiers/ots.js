// ERC-8434 `committedAt` verifier for anchor kind "ots" (OpenTimestamps over Bitcoin), Node stdlib only.
//
// committedAt: { anchor: "ots", proof: { ots: <base64 .ots file>, blockHeader: <80-byte hex>, blockHash: <hex, display order> } }
//
// Returns the proven time (the block header's timestamp, unix seconds) or null. It is offline: the proof carries the
// 80-byte header of the block the OpenTimestamps path ends in, pinned by its hash, so any Bitcoin explorer can confirm
// that block independently. Checks, in order:
//   1. the .ots file is a detached SHA-256 timestamp whose stamped digest equals the facet's `digest`;
//   2. sha256d(blockHeader), byte-reversed, equals proof.blockHash;
//   3. some path of the timestamp tree ends in a Bitcoin block-header attestation whose message equals that
//      header's merkle root (bytes 36..68, internal byte order, as OpenTimestamps compares it).
// A pending-only proof (calendar attestations, no Bitcoin attestation yet) returns null: the resolver then reports
// timing "integrity-only", which is right until the calendar's transaction confirms.
const crypto = require("crypto");

const MAGIC = Buffer.from("004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294", "hex");
const BITCOIN_TAG = "0588960d73d71901";
const UNARY = { 0x08: "sha256", 0x02: "sha1", 0x03: "ripemd160" };   // 0x67 keccak256 is not used by public calendars

function reader(buf) {
  let i = 0;
  const need = (n) => { if (i + n > buf.length) throw new Error("truncated .ots"); };
  const byte = () => { need(1); return buf[i++]; };
  const bytes = (n) => { need(n); const b = buf.subarray(i, i + n); i += n; return b; };
  const varuint = () => { let v = 0, s = 0, b; do { b = byte(); v += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return v; };
  const varbytes = () => bytes(varuint());
  return { byte, bytes, varuint, varbytes, done: () => i === buf.length };
}

// Walk the timestamp tree from `msg`, collecting [message, height] for every Bitcoin attestation.
function walk(r, msg, out, depth = 0) {
  if (depth > 256) throw new Error("timestamp tree too deep");
  const one = (tag) => {
    if (tag === 0x00) {
      const att = r.bytes(8).toString("hex"); const payload = r.varbytes();
      if (att === BITCOIN_TAG) out.push([Buffer.from(msg), reader(payload).varuint()]);
      return;
    }
    let next;
    if (UNARY[tag]) next = crypto.createHash(UNARY[tag]).update(msg).digest();
    else if (tag === 0xf0) next = Buffer.concat([msg, r.varbytes()]);
    else if (tag === 0xf1) next = Buffer.concat([r.varbytes(), msg]);
    else throw new Error(`unsupported op 0x${tag.toString(16)}`);
    walk(r, next, out, depth + 1);
  };
  let tag = r.byte();
  while (tag === 0xff) { one(r.byte()); tag = r.byte(); }
  one(tag);
}

function verifyOts(facet) {
  try {
    const p = (facet.committedAt || {}).proof || {};
    const ots = Buffer.from(p.ots || "", "base64");
    const r = reader(ots);
    if (!r.bytes(MAGIC.length).equals(MAGIC)) return null;
    if (r.varuint() !== 1) return null;                  // file format version
    if (r.byte() !== 0x08) return null;                  // detached SHA-256 timestamp
    const stamped = r.bytes(32);
    const want = String(facet.digest || "").toLowerCase().replace(/^0x/, "");
    if (stamped.toString("hex") !== want) return null;   // the proof must be over this facet's digest
    const atts = []; walk(r, stamped, atts);
    if (!r.done()) return null;
    const header = Buffer.from(String(p.blockHeader || ""), "hex");
    if (header.length !== 80) return null;
    const h = crypto.createHash("sha256").update(crypto.createHash("sha256").update(header).digest()).digest();
    if (Buffer.from(h).reverse().toString("hex") !== String(p.blockHash || "").toLowerCase()) return null;
    const root = header.subarray(36, 68);
    if (!atts.some(([m]) => m.equals(root))) return null;
    return header.readUInt32LE(68);
  } catch { return null; }
}

module.exports = { verifyOts };
