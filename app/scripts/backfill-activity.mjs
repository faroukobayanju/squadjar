// One-off: index every sNGN movement since the first deployment. Run from app/: node scripts/backfill-activity.mjs
// Monad testnet caps eth_getLogs at 100 blocks, so walk in 100-block chunks. Safe to re-run (idempotent insert).
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { createPublicClient, http, parseAbiItem } from "viem";
import { monadTestnet } from "viem/chains";
import { LEGACY_DEPLOY_BLOCK, LEGACY_FACTORY, insertRows, rowsFor } from "../lib/activity-classify.ts";

try {
  process.loadEnvFile(".env.local");
} catch {}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (.env.local)");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const dep = JSON.parse(readFileSync("../contracts/deployments/10143.json", "utf8"));
const client = createPublicClient({ chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz", { retryCount: 6, retryDelay: 500 }) });
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const latest = await client.getBlockNumber();
const chunks = [];
for (let b = LEGACY_DEPLOY_BLOCK; b <= latest; b += 100n) chunks.push(b);
const hashes = new Set();
let next = 0;
// ponytail: 8 parallel getLogs; drop if the RPC starts rate-limiting.
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < chunks.length) {
      const from = chunks[next++];
      const to = from + 99n > latest ? latest : from + 99n;
      for (const l of await client.getLogs({ address: dep.token, event: transfer, fromBlock: from, toBlock: to })) hashes.add(l.transactionHash);
    }
  }),
);
console.log(`scanned ${chunks.length} chunks (${LEGACY_DEPLOY_BLOCK}..${latest}), ${hashes.size} txs`);

const cache = new Map();
let rows = 0;
for (const hash of hashes) {
  const receipt = await client.getTransactionReceipt({ hash });
  rows += await insertRows(sql, await rowsFor(client, receipt, [dep.factory, LEGACY_FACTORY], dep.token, cache));
}
const [{ n }] = await sql`select count(*)::int as n from activity`;
console.log(`inserted ${rows} new rows; activity has ${n}`);
