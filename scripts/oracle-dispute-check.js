// Re-reads every fact in assets/erc-aid/vectors/fixtures/oracle-dispute-facts.json from public RPCs: receipt status, block number,
// block time, and each listed log (emitting contract, event, arguments). Also checks questionId / conditionId / the DVM ancillary-data
// hash derivations and the vote round end. Needs network; not part of `npm test` (the fixture itself resolves offline).
//   node scripts/oracle-dispute-check.js [--polygon <rpc>] [--ethereum <rpc>]
// Archive log access is needed; defaults are public gateways that served it when this was written.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const RPC = { 137: arg("polygon", "https://polygon.drpc.org"), 1: arg("ethereum", "https://gateway.tenderly.co/public/mainnet") };
const facts = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "erc-aid", "vectors", "fixtures", "oracle-dispute-facts.json")));
const iface = new ethers.Interface([
  "event QuestionInitialized(bytes32 indexed questionID, uint256 indexed requestTimestamp, address indexed creator, bytes ancillaryData, address rewardToken, uint256 reward, uint256 proposalBond)",
  "event QuestionReset(bytes32 indexed questionID)",
  "event QuestionResolved(bytes32 indexed questionID, int256 indexed settledPrice, uint256[] payouts)",
  "event RequestPrice(address indexed requester, bytes32 identifier, uint256 timestamp, bytes ancillaryData, address currency, uint256 reward, uint256 finalFee)",
  "event ProposePrice(address indexed requester, address indexed proposer, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 proposedPrice, uint256 expirationTimestamp, address currency)",
  "event DisputePrice(address indexed requester, address indexed proposer, address indexed disputer, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 proposedPrice)",
  "event ConditionResolution(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators)",
  "event RequestAdded(address indexed requester, uint32 indexed roundId, bytes32 indexed identifier, uint256 time, bytes ancillaryData, bool isGovernance)",
  "event RequestResolved(uint32 indexed roundId, uint256 indexed resolvedPriceRequestIndex, bytes32 indexed identifier, uint256 time, bytes ancillaryData, int256 price)",
  "event PushedPrice(bytes32 indexed identifier, uint256 time, bytes ancillaryData, int256 price, bytes32 indexed requestHash)",
]);
const str = (v) => Array.isArray(v) || (v && typeof v.toArray === "function") ? Array.from(v).map(str) : typeof v === "bigint" ? v.toString() : typeof v === "string" ? v.toLowerCase() : v;
let fail = 0;
const chk = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (ok || !extra ? "" : "  " + extra)); if (!ok) fail++; };
(async () => {
  const P = Object.fromEntries(Object.entries(RPC).map(([c, u]) => [c, new ethers.JsonRpcProvider(u, Number(c), { staticNetwork: true })]));
  const m = facts.market;
  let ancillary = null;
  for (const ev of facts.events) {
    const p = P[ev.chainId];
    const rc = await p.getTransactionReceipt(ev.tx);
    if (!rc) { chk(`${ev.step} ${ev.tx}`, false, "no receipt"); continue; }
    const blk = await p.getBlock(rc.blockNumber);
    chk(`${ev.step}: tx status 1, block ${ev.block}, time ${ev.time} (${new Date(ev.time * 1000).toISOString()})`, rc.status === 1 && rc.blockNumber === ev.block && blk.timestamp === ev.time, JSON.stringify({ status: rc.status, block: rc.blockNumber, time: blk.timestamp }));
    for (const want of ev.logs) {
      const hit = rc.logs.map((l) => { try { return { l, p: iface.parseLog(l) }; } catch { return null; } }).filter(Boolean).find(({ l, p: d }) =>
        l.address.toLowerCase() === want.contract.toLowerCase() && d.name === want.event &&
        Object.entries(want.args).every(([k, v]) => JSON.stringify(str(d.args[k])) === JSON.stringify(str(v))) &&
        (!want.ancillaryDataIncludes || ethers.toUtf8String(d.args.ancillaryData).includes(want.ancillaryDataIncludes)));
      chk(`  ${want.event} @ ${want.contract} ${JSON.stringify(want.args)}`, !!hit);
      if (hit && hit.p.name === "QuestionInitialized") ancillary = hit.p.args.ancillaryData;
    }
  }
  if (ancillary) {
    chk("questionId == keccak256(ancillaryData)", ethers.keccak256(ancillary) === m.questionId);
    chk("DVM ancillaryDataHash == keccak256(ancillaryData ++ \",ooRequester:<adapter>\")", ethers.keccak256(ethers.concat([ancillary, ethers.toUtf8Bytes(",ooRequester:" + m.adapter.slice(2).toLowerCase())])) === m.dvmAncillaryDataHash);
    chk("ancillaryData states the deadline as 11:59 PM ET of the listed date", ethers.toUtf8String(ancillary).includes("by the listed date, 11:59 PM ET") && ethers.toUtf8String(ancillary).includes("by May 24?"));
  } else chk("ancillaryData read from QuestionInitialized", false);
  chk("conditionId == keccak256(abi.encodePacked(adapter, questionId, 2))", ethers.solidityPackedKeccak256(["address", "bytes32", "uint256"], [m.adapter, m.questionId, 2]) === m.conditionId);
  for (const v of facts.views) {
    const c = new ethers.Contract(v.contract, [v.call], P[v.chainId]);
    const fn = c.interface.fragments[0].name;
    const got = (await c[fn](...v.args)).toString();
    chk(`${v.step}: ${fn}(${v.args.join(",")}) == ${v.result}`, got === v.result, got);
  }
  console.log(fail ? `\n${fail} FAILED` : "\nALL PASS"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
