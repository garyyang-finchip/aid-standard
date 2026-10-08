// Behavioural tests for AIDRegistry on the in-process Hardhat network.
// Run: npx hardhat run test/run.js
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

const art = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const S = { DORMANT: 0n, ACTIVE: 1n, STALE: 2n, RETIRED: 3n };
let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e.shortMessage || e.message)); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || "eq") + `: ${a} !== ${b}`); }
const errIface = new ethers.Interface(art("IAIDRegistry").abi);
function errName(e) {
  const m = (e.message || "").match(/return data: (0x[0-9a-f]+)/i);
  if (!m) return e.message;
  try { return errIface.parseError(m[1]).name; } catch { return m[1].slice(0, 10); }
}
async function reverts(p, sel) {
  try { await p; } catch (e) { const n = errName(e); if (sel && n !== sel && !(e.message || "").includes(sel)) throw new Error(`reverted with ${n}, expected ${sel}`); return; }
  throw new Error("expected revert " + (sel || ""));
}
const warp = async (s) => { await hre.network.provider.send("evm_increaseTime", [s]); await hre.network.provider.send("evm_mine"); };
const now = async () => (await ethers.provider.getBlock("latest")).timestamp;

async function main() {
  const [deployer, agentA, agentB, owner, relayer, stranger] = await ethers.getSigners();
  const DEF = 90 * 86400, MAX = 365 * 86400;
  const Reg = await new ethers.ContractFactory(art("AIDRegistry").abi, art("AIDRegistry").bytecode, deployer).deploy(DEF, MAX);
  const Id = await new ethers.ContractFactory(art("MockIdentityRegistry8004").abi, art("MockIdentityRegistry8004").bytecode, deployer).deploy();
  const reg = Reg.getAddress ? await Reg.getAddress() : Reg.target; const idr = await Id.getAddress();
  const R = (s) => Reg.connect(s), I = (s) => Id.connect(s);
  console.log("AIDRegistry", reg, "\nMockIdentityRegistry8004", idr);

  // owner registers two agents; agent 1 wallet = agentA, agent 2 wallet unset (owner = owner)
  await (await I(owner).register()).wait(); // id 1
  await (await I(owner).register()).wait(); // id 2
  await (await I(owner).setAgentWallet(1, agentA.address)).wait();

  console.log("\n# states & binding");
  await t("any address is DORMANT by default", async () => eq(await Reg.state(stranger.address), S.DORMANT));
  await t("bind requires agentWallet or owner == anchor", async () =>
    reverts(R(stranger).bind(idr, 1), "NotAgentOfAnchor"));
  await t("bind via agentWallet -> ACTIVE", async () => {
    await (await R(agentA).bind(idr, 1)).wait();
    eq(await Reg.state(agentA.address), S.ACTIVE);
    const b = await Reg.bindingOf(agentA.address); eq(b.registry, idr); eq(b.agentId, 1n);
    eq(await Reg.anchorOf(idr, 1), agentA.address);
  });
  await t("one anchor cannot bind twice", async () => reverts(R(agentA).bind(idr, 2), "AlreadyBound"));
  await t("one agent cannot be bound by two anchors (owner tries agent 1)", async () =>
    reverts(R(owner).bind(idr, 1), "AgentAlreadyBound"));
  await t("bind via owner -> ACTIVE (agent 2 has no wallet)", async () => {
    await (await R(owner).bind(idr, 2)).wait(); eq(await Reg.state(owner.address), S.ACTIVE);
  });
  await t("bind to non-contract registry reverts", async () => reverts(R(stranger).bind(stranger.address, 1), "NotAgentOfAnchor"));

  console.log("\n# liveness");
  await t("beyond default window -> STALE, heartbeat -> ACTIVE", async () => {
    await warp(DEF + 1); eq(await Reg.state(agentA.address), S.STALE);
    await (await R(agentA).heartbeat()).wait(); eq(await Reg.state(agentA.address), S.ACTIVE);
  });
  await t("per-anchor shorter window honoured; > max rejected; 0 resets", async () => {
    await reverts(R(agentA).setLivenessWindow(MAX + 1), "InvalidWindow");
    await (await R(agentA).setLivenessWindow(3600)).wait(); eq(await Reg.livenessWindow(agentA.address), 3600n);
    await warp(3601); eq(await Reg.state(agentA.address), S.STALE);
    await (await R(agentA).setLivenessWindow(0)).wait(); // write refreshes lastSeen too
    eq(await Reg.livenessWindow(agentA.address), BigInt(DEF)); eq(await Reg.state(agentA.address), S.ACTIVE);
  });
  await t("any anchor write refreshes lastSeen", async () => {
    const before = await Reg.lastSeen(agentA.address); await warp(10);
    await (await R(agentA).setDocumentURI("ipfs://doc", ethers.keccak256("0x01"))).wait();
    if (!((await Reg.lastSeen(agentA.address)) > before)) throw new Error("lastSeen not refreshed");
  });

  console.log("\n# binding drift");
  await t("agentWallet moved away -> STALE without any AID tx", async () => {
    await (await I(owner).setAgentWallet(1, agentB.address)).wait();
    eq(await Reg.state(agentA.address), S.STALE);
    await (await I(owner).setAgentWallet(1, agentA.address)).wait();
    eq(await Reg.state(agentA.address), S.ACTIVE);
  });
  await t("agent burned -> STALE (ownerOf reverts is caught)", async () => {
    await (await I(owner).transfer(2, stranger.address)).wait(); // owner no longer owner of 2
    eq(await Reg.state(owner.address), S.STALE);
    await (await I(stranger).burn(2)).wait(); eq(await Reg.state(owner.address), S.STALE);
  });

  console.log("\n# facets");
  const FT = ethers.keccak256(ethers.toUtf8Bytes("aid:finance/observed/v1"));
  await t("setFacet validates window and access", async () => {
    const n = await now();
    await reverts(R(agentA).setFacet(FT, ethers.ZeroHash, n, 0, 2, ""), "InvalidFacet");
    await reverts(R(agentA).setFacet(FT, ethers.ZeroHash, n, n, 2, ""), "InvalidFacet");
    await reverts(R(agentA).setFacet(FT, ethers.ZeroHash, n, n + 10, 3, ""), "InvalidAccess");
    await (await R(agentA).setFacet(FT, ethers.keccak256("0xaa"), n, n + 86400, 2, "")).wait();
    const f = await Reg.getFacet(agentA.address, FT); eq(f.access, 2n); eq(f.validUntil, BigInt(n + 86400));
    eq((await Reg.facetTypesOf(agentA.address)).length, 1);
  });
  await t("clearFacet with swap-and-pop keeps list consistent", async () => {
    const FT2 = ethers.keccak256(ethers.toUtf8Bytes("aid:behavior/runtime/v1"));
    const FT3 = ethers.keccak256(ethers.toUtf8Bytes("aid:skills/erc8338/v1"));
    const n = await now();
    await (await R(agentA).setFacet(FT2, ethers.ZeroHash, 0, n + 10, 0, "u2")).wait();
    await (await R(agentA).setFacet(FT3, ethers.ZeroHash, 0, n + 10, 1, "u3")).wait();
    await (await R(agentA).clearFacet(FT)).wait();
    const list = await Reg.facetTypesOf(agentA.address);
    eq(list.length, 2); if (!list.includes(FT2) || !list.includes(FT3)) throw new Error("list wrong");
    await reverts(R(agentA).clearFacet(FT), "UnknownFacet");
    eq((await Reg.getFacet(agentA.address, FT)).validUntil, 0n);
  });

  console.log("\n# bindWithSig (EIP-712, relayer-submitted)");
  const domain = { name: "AIDRegistry", version: "1", chainId: 31337, verifyingContract: reg };
  const types = { Bind: [
    { name: "anchor", type: "address" }, { name: "registry", type: "address" }, { name: "agentId", type: "uint256" },
    { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" } ] };
  await (await I(owner).register()).wait(); // id 3
  await (await I(owner).setAgentWallet(3, agentB.address)).wait();
  await t("EOA anchor signs, relayer submits -> bound; nonce consumed", async () => {
    const deadline = (await now()) + 3600;
    const sig = await agentB.signTypedData(domain, types, { anchor: agentB.address, registry: idr, agentId: 3, nonce: 0, deadline });
    await (await R(relayer).bindWithSig(agentB.address, idr, 3, deadline, sig)).wait();
    eq(await Reg.state(agentB.address), S.ACTIVE); eq(await Reg.nonces(agentB.address), 1n);
  });
  await t("replay / wrong signer / expired rejected", async () => {
    await (await R(agentB).unbind()).wait();
    const deadline = (await now()) + 3600;
    const sigOld = await agentB.signTypedData(domain, types, { anchor: agentB.address, registry: idr, agentId: 3, nonce: 0, deadline });
    await reverts(R(relayer).bindWithSig(agentB.address, idr, 3, deadline, sigOld), "InvalidSignature");
    const sigBad = await stranger.signTypedData(domain, types, { anchor: agentB.address, registry: idr, agentId: 3, nonce: 2, deadline });
    await reverts(R(relayer).bindWithSig(agentB.address, idr, 3, deadline, sigBad), "InvalidSignature");
    const sigExp = await agentB.signTypedData(domain, types, { anchor: agentB.address, registry: idr, agentId: 3, nonce: 3, deadline: 1 });
    await reverts(R(relayer).bindWithSig(agentB.address, idr, 3, 1, sigExp), "SignatureExpired");
  });
  await t("EIP-1271 contract anchor (smart account) binds via its owner's signature", async () => {
    const W = await new ethers.ContractFactory(art("MockERC1271Wallet").abi, art("MockERC1271Wallet").bytecode, deployer).deploy(agentB.address);
    const w = await W.getAddress();
    await (await I(owner).register()).wait(); // id 4
    await (await I(owner).setAgentWallet(4, w)).wait();
    const deadline = (await now()) + 3600;
    const sig = await agentB.signTypedData(domain, types, { anchor: w, registry: idr, agentId: 4, nonce: 0, deadline });
    await (await R(relayer).bindWithSig(w, idr, 4, deadline, sig)).wait();
    eq(await Reg.state(w), S.ACTIVE); eq(await Reg.anchorOf(idr, 4), w);
  });

  console.log("\n# retirement");
  await t("retire releases binding, is irreversible, successor can bind same agent", async () => {
    await (await R(agentA).retire(agentB.address)).wait();
    eq(await Reg.state(agentA.address), S.RETIRED); eq(await Reg.successorOf(agentA.address), agentB.address);
    eq(await Reg.anchorOf(idr, 1), ethers.ZeroAddress);
    await reverts(R(agentA).heartbeat(), "AIDRetired");
    await reverts(R(agentA).bind(idr, 1), "AIDRetired");
    await reverts(R(agentA).retire(ethers.ZeroAddress), "AIDRetired");
    // facets survive as history
    eq((await Reg.facetTypesOf(agentA.address)).length, 2);
    // successor takes over agent 1 once the 8004 wallet points to it
    await (await I(owner).setAgentWallet(1, agentB.address)).wait();
    await (await R(agentB).bind(idr, 1)).wait(); eq(await Reg.state(agentB.address), S.ACTIVE);
  });
  await t("bindWithSig for a retired anchor reverts", async () => {
    const deadline = (await now()) + 3600;
    const sig = await agentA.signTypedData(domain, types, { anchor: agentA.address, registry: idr, agentId: 1, nonce: 0, deadline });
    await reverts(R(relayer).bindWithSig(agentA.address, idr, 1, deadline, sig), "AIDRetired");
  });
  await t("supportsInterface(IAIDRegistry)", async () => {
    const iface = new ethers.Interface(art("IAIDRegistry").abi);
    let id = 0n; for (const f of iface.fragments) if (f.type === "function") id ^= BigInt(f.selector);
    const sel = "0x" + id.toString(16).padStart(8, "0");
    eq(await Reg.supportsInterface(sel), true); eq(await Reg.supportsInterface("0x01ffc9a7"), true);
    console.log("       IAIDRegistry interfaceId =", sel);
  });

  console.log("\n# stale-binding takeover (authority intervals)");
  const signers = await ethers.getSigners();
  const X = signers[6], Y = signers[7], Z = signers[8];
  await (await I(owner).register()).wait(); // id 5
  await (await I(owner).setAgentWallet(5, X.address)).wait();
  await (await R(X).bind(idr, 5)).wait();
  await t("new wallet holder takes over a binding whose predicate failed; old anchor unbound", async () => {
    await (await I(owner).setAgentWallet(5, Y.address)).wait();
    eq(await Reg.state(X.address), S.STALE);
    const tx = await R(Y).bind(idr, 5); const rc = await tx.wait();
    const names = rc.logs.map((l) => { try { return Reg.interface.parseLog(l).name; } catch { return null; } }).filter(Boolean);
    if (!(names.includes("Unbound") && names.includes("Bound"))) throw new Error("expected Unbound(old)+Bound(new), got " + names);
    eq(await Reg.state(Y.address), S.ACTIVE); eq(await Reg.anchorOf(idr, 5), Y.address);
    eq(await Reg.state(X.address), S.DORMANT); eq((await Reg.bindingOf(X.address)).registry, ethers.ZeroAddress);
  });
  await t("takeover refused while the old anchor still satisfies the predicate (owner vs wallet)", async () => {
    await (await I(owner).register()).wait(); // id 6, no wallet -> owner qualifies
    await (await R(owner).unbind()).wait(); // owner was bound to (burned) agent 2 earlier; free it
    await (await R(owner).bind(idr, 6)).wait(); eq(await Reg.state(owner.address), S.ACTIVE);
    await (await I(owner).setAgentWallet(6, Z.address)).wait(); // Z qualifies too, but owner still does
    await reverts(R(Z).bind(idr, 6), "AgentAlreadyBound");
    eq(await Reg.anchorOf(idr, 6), owner.address);
  });
  await t("A -> gap -> A: returning anchor re-binds (new interval), does not inherit the gap", async () => {
    await (await I(owner).setAgentWallet(5, X.address)).wait(); // relation returns to X; Y is now stale
    eq(await Reg.state(Y.address), S.STALE);
    const before = (await Reg.bindingOf(Y.address)).boundAt;
    await warp(5);
    await (await R(X).bind(idr, 5)).wait();
    const b = await Reg.bindingOf(X.address);
    eq(await Reg.state(X.address), S.ACTIVE); eq(await Reg.state(Y.address), S.DORMANT);
    if (!(b.boundAt > before)) throw new Error("boundAt must mark the new interval");
  });
  await t("takeover still requires the new anchor to qualify", async () =>
    reverts(R(stranger).bind(idr, 5), "NotAgentOfAnchor"));

  console.log("\n# end-to-end: reference resolver over the live registry");
  await t("resolver: ACTIVE anchor with data: document, digest verified, facets classified", async () => {
    const { snapshotFromChain, resolveSnapshot } = require("../tools/aid-resolve/resolve");
    const { canonicalize } = require("../tools/jcs");
    const n = await now();
    const doc = { version: "aid-document/v1", aid: `eip155:31337:${agentB.address}`, binding: { registry: idr, agentId: 1 }, facets: [
      { facetType: "aid:core/identity/v1", provenance: "SELF", issuer: `eip155:31337:${agentB.address}`, validUntil: n + 86400, digest: ethers.ZeroHash, access: { mode: "PUBLIC" }, resolver: { kind: "erc8004-identity", registry: idr, agentId: 1 } },
      { facetType: "aid:skills/erc8338/v1", provenance: "OBSERVED", issuer: `eip155:31337:${agentB.address}`, validUntil: n - 1, digest: ethers.ZeroHash, access: { mode: "PUBLIC" }, resolver: { kind: "erc8338" } },
    ] };
    const jcs = canonicalize(doc); const digest = ethers.keccak256(ethers.toUtf8Bytes(jcs));
    const uri = "data:application/json;base64," + Buffer.from(jcs).toString("base64");
    await (await R(agentB).setDocumentURI(uri, digest)).wait();
    const snap = await snapshotFromChain(ethers.provider, reg, agentB.address, null);
    const r = await resolveSnapshot(snap, n + 5, { provider: ethers.provider });
    eq(r.onChainState, "ACTIVE"); eq(r.resolvedState, "ACTIVE"); eq(r.document !== null, true);
    eq(r.facets.current.length, 1); eq(r.facets.history.length, 1); eq(r.reasons.length, 0);
  });
  await t("resolver: RETIRED anchor reports successor rule", async () => {
    const { snapshotFromChain, resolveSnapshot } = require("../tools/aid-resolve/resolve");
    const snap = await snapshotFromChain(ethers.provider, reg, agentA.address, null);
    const r = await resolveSnapshot(snap, await now());
    eq(r.onChainState, "RETIRED"); eq(snap.successor, agentB.address);
  });

  console.log("\n# authority intervals & timing (resolver)");
  await t("intervals reconstructed from Bound/Unbound + Transfer/MetadataSet(agentWallet); gap evidence unattributable", async () => {
    const { reconstructIntervals, resolveSnapshot } = require("../tools/aid-resolve/resolve");
    const regEv = new ethers.Contract(reg, ["event Bound(address indexed anchor, address indexed registry, uint256 indexed agentId)", "event Unbound(address indexed anchor, address indexed registry, uint256 indexed agentId)"], ethers.provider);
    const iv = await reconstructIntervals(ethers.provider, regEv, X.address, 0);
    // X: bound -> wallet moved to Y (gap) -> Y took over -> wallet back -> X re-bound  => two intervals
    eq(iv.length, 2, "two intervals"); if (!(iv[0].until != null && iv[1].until == null && iv[0].until <= iv[1].from)) throw new Error("bad interval shape " + JSON.stringify(iv));
    const gapTs = iv[0].until, inTs = iv[1].from;
    const mk = (obs) => ({ facetType: "aid:review/erc8004/v1", provenance: "ATTESTED", issuer: `eip155:31337:${X.address}`, validUntil: inTs + 10 ** 6, observedAt: obs, digest: ethers.ZeroHash, access: { mode: "PUBLIC" }, resolver: { kind: "erc8004-reputation", registry: idr, agentId: 5 } });
    const addr = { facetType: "aid:skills/erc8338/v1", provenance: "OBSERVED", issuer: `eip155:31337:${X.address}`, validUntil: inTs + 10 ** 6, observedAt: gapTs, digest: ethers.ZeroHash, access: { mode: "PUBLIC" }, resolver: { kind: "erc8338" } };
    const snap = { aid: `eip155:31337:${X.address}`, state: 1, authorityIntervals: iv, document: { version: "aid-document/v1", aid: `eip155:31337:${X.address}`, facets: [mk(gapTs), mk(inTs), addr] } };
    snap.documentDigest = ethers.keccak256(ethers.toUtf8Bytes(require("../tools/jcs").canonicalize(snap.document)));
    const r = await resolveSnapshot(snap, inTs + 1);
    eq(r.facets.unattributable.length, 1, "gap review facet unattributable");
    eq(r.facets.current.length, 2, "in-interval review + address-keyed skills");
    const sk = r.facets.current.find((f) => f.facetType.startsWith("aid:skills")); eq(sk.attribution, "outside-interval");
  });
  await t("timing: block-anchored commitment before subjectWindow.until -> pre-outcome; after or within tolerance -> integrity-only", async () => {
    const { resolveSnapshot } = require("../tools/aid-resolve/resolve");
    const n0 = await now();
    const digest = ethers.keccak256(ethers.toUtf8Bytes("verdict:task-7:accepted"));
    const FTv = ethers.keccak256(ethers.toUtf8Bytes("aid:tasks/erc8414/v1"));
    const tx = await R(X).setFacet(FTv, digest, n0, n0 + 10 ** 6, 0, "ipfs://verdict"); const rc = await tx.wait();
    const at = (await ethers.provider.getBlock(rc.blockNumber)).timestamp;
    const base = { facetType: "aid:tasks/erc8414/v1", provenance: "ATTESTED", issuer: `eip155:31337:${X.address}`, validUntil: at + 10 ** 6, observedAt: at, digest, access: { mode: "PUBLIC" }, resolver: { kind: "erc8414" }, committedAt: { anchor: "block", proof: { chainId: 31337, txHash: rc.hash } } };
    const pre = { ...base, subjectWindow: { from: at - 100, until: at + 1000 } };
    const post = { ...base, facetType: "aid:tasks/erc8414/v1", subjectWindow: { from: at - 1000, until: at - 1 } };
    const bad = { ...base, committedAt: { anchor: "block", proof: { chainId: 31337, txHash: "0x" + "11".repeat(32) } }, subjectWindow: { from: at - 100, until: at + 1000 } };
    const none = { ...base }; delete none.committedAt;
    const near = { ...base, facetType: "aid:behavior/core/v1", subjectWindow: { from: at - 100, until: at + 5 } }; // inside the 12 s block tolerance
    const doc = { version: "aid-document/v1", aid: `eip155:31337:${X.address}`, facets: [pre, post, bad, none, near] };
    const snap = { aid: doc.aid, state: 1, document: doc, documentDigest: ethers.keccak256(ethers.toUtf8Bytes(require("../tools/jcs").canonicalize(doc))) };
    const r = await resolveSnapshot(snap, at + 1, { provider: ethers.provider });
    const t5 = r.facets.current.map((f) => f.timing);
    eq(JSON.stringify(t5), JSON.stringify(["pre-outcome", "integrity-only", "integrity-only", "none", "integrity-only"]));
    if (!/within anchor tolerance/.test(r.facets.current[4].timingReason)) throw new Error("tolerance reason missing: " + r.facets.current[4].timingReason);
    eq(r.facets.current[0].committedAtVerified, at);
  });

  await t("exclusivity: issuer-declared log -> unique keeps pre-outcome; duplicate / undeclared downgrade", async () => {
    const { resolveSnapshot } = require("../tools/aid-resolve/resolve");
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "erc-aid", "vectors", "fixtures", "log-exclusivity.json")));
    const r = await resolveSnapshot(fx, 1791200000, { trustedTimestamps: fx.trustedTimestamps, issuerLogs: fx.issuerLogs, logEntries: fx.logEntries });
    const got = r.facets.current.map((f) => [f.timing, f.exclusivity]);
    eq(JSON.stringify(got), JSON.stringify([["pre-outcome", "unique"], ["integrity-only", "duplicate"], ["integrity-only", "undeclared"]]));
  });

  await t("supersession: document chain -> old is history; hidden replacement found in issuer log; cross-issuer refused", async () => {
    const { resolveSnapshot } = require("../tools/aid-resolve/resolve");
    const load = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "erc-aid", "vectors", "fixtures", n)));
    const run = async (fx) => resolveSnapshot(fx, 1791200000, { trustedTimestamps: fx.trustedTimestamps, issuerLogs: fx.issuerLogs, logEntries: fx.logEntries });
    let r = await run(load("supersession-chain.json"));
    eq(r.facets.current.length, 1); eq(r.facets.current[0].finality, "final"); eq(r.facets.current[0].exclusivity, "unique-latest");
    eq(r.facets.history.length, 1); eq(r.facets.history[0].supersededBy.toLowerCase(), r.facets.current[0].digest.toLowerCase());
    r = await run(load("supersession-hidden.json"));
    eq(r.facets.current.length, 0); eq(r.facets.history.length, 1); eq(r.facets.history[0].reason, "superseded in issuer log");
    r = await run(load("supersession-cross-issuer.json"));
    eq(r.facets.current.length, 2); if (!r.reasons.some((x) => /cross-issuer/.test(x))) throw new Error("cross-issuer not reported");
    const old = r.facets.current.find((f) => f.finality === "provisional"); eq(old.timing, "pre-outcome");
  });

  await t("supersession timing: replacement proven before / after the outcome / unproven; final pre-outcome reversed after the outcome is flagged", async () => {
    const { resolveSnapshot } = require("../tools/aid-resolve/resolve");
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "erc-aid", "vectors", "fixtures", "supersession-timing.json")));
    const r = await resolveSnapshot(fx, 1791200000, { trustedTimestamps: fx.trustedTimestamps, issuerLogs: fx.issuerLogs, logEntries: fx.logEntries });
    eq(r.facets.current.length, 0); eq(r.facets.history.length, 6);
    const got = r.facets.history.map((f) => [f.facetType, f.timing, f.finality, f.supersessionTiming, !!f.reversedAfterOutcome]);
    eq(JSON.stringify(got), JSON.stringify([
      ["aid:tasks/erc8414/v1", "pre-outcome", "final", "before-outcome", false],
      ["aid:review/erc8004/v1", "pre-outcome", "final", "not-before-outcome", true],
      ["aid:behavior/core/v1", "pre-outcome", "final", "unknown", false],
      ["aid:finance/observed/v1", "pre-outcome", "provisional", "not-before-outcome", false],
      ["aid:skills/erc8338/v1", "pre-outcome", "final", "not-before-outcome", true],
      ["aid:core/kya/v1", "integrity-only", "final", "not-before-outcome", false],
    ]));
    // document-side supersession reports the same fields (replacement's own committedAt as its proven time)
    const ch = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "erc-aid", "vectors", "fixtures", "supersession-chain.json")));
    const r2 = await resolveSnapshot(ch, 1791200000, { trustedTimestamps: ch.trustedTimestamps, issuerLogs: ch.issuerLogs, logEntries: ch.logEntries });
    eq(r2.facets.history[0].supersessionTiming, "before-outcome"); eq(r2.facets.history[0].timing, "pre-outcome");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
