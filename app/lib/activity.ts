import type { Address, Hex, PublicClient, TransactionReceipt } from "viem";
import { sql } from "./db";
import { FACTORY, TOKEN, fromUnits, publicClient } from "./live/chain";
import { squadAbi } from "./live/abi";
import { LEGACY_FACTORIES, decode, insertRows, rowsFor } from "./activity-classify";
import { alertsFor, type Credit, type Settle, type Stage } from "./alerts";
import { naira } from "./format";
import { people, tr } from "./messages";
import type { Key } from "./i18n/core";

/** Indexes one transaction's sNGN movements from the chain (never from the caller), then writes its miss alerts. Returns how many rows were new. */
export async function indexTx(hash: Hex): Promise<number> {
  let receipt: TransactionReceipt | undefined;
  for (let i = 0; !receipt; i++) {
    receipt = await publicClient.getTransactionReceipt({ hash }).catch((e) => {
      if (i >= 4) throw e; // not found yet (or RPC trouble): retry for ~4s
      return undefined;
    });
    if (!receipt) await new Promise((ok) => setTimeout(ok, 1000));
  }
  if (receipt.status !== "success") return 0;
  const n = await insertRows(sql, await rowsFor(publicClient as PublicClient, receipt, [FACTORY, ...LEGACY_FACTORIES], TOKEN));
  await writeAlerts(receipt).catch((e) => console.error("alerts failed", { tx: hash }, e)); // history is in; re-indexing this tx (idempotent) writes them later
  return n;
}

const KEYS: Record<Stage, Key> = { debt: "alertDebt", covered: "alertCovered", short: "alertShort", credit: "alertCredit" };

/** In-app alerts for misses and pay backs in this tx. Idempotent: the notifications key makes a re-index a no-op. */
async function writeAlerts(receipt: TransactionReceipt) {
  const ev = decode(receipt.logs);
  const settles: Settle[] = [];
  const credits: Credit[] = [];
  for (const l of ev) {
    if (l.eventName === "RoundSettled" && l.args.missed.length) settles.push({ squad: l.address, round: l.args.round, collector: l.args.collector, missed: l.args.missed });
    if (l.eventName === "CreditPaid") credits.push({ squad: l.address, member: l.args.member, amount: l.args.amount, logIndex: l.logIndex });
  }
  if (!settles.length && !credits.length) return;
  // Only squads with a row (notifications.squad references squads); the row also proves the emitter is a squad we created.
  const addrs = [...new Set([...settles, ...credits].map((x) => x.squad))];
  const rows = await sql`select address, name, slug from squads where address = any(${addrs})`;
  const squads = new Map(rows.map((r) => [r.address as string, r as { name: string; slug: string }]));
  // Debt before and after this tx, for squads where someone missed.
  const owed = new Map<string, bigint>();
  for (const squad of new Set(settles.map((s) => s.squad).filter((s) => squads.has(s)))) {
    for (const [when, blockNumber] of [["before", receipt.blockNumber - BigInt(1)], ["after", receipt.blockNumber]] as const) {
      const v = await publicClient.readContract({ address: squad as Address, abi: squadAbi, functionName: "getState", blockNumber });
      v.members.forEach((m, i) => owed.set(`${squad}:${m.toLowerCase()}:${when}`, v.owed[i]));
    }
  }
  const alerts = alertsFor(receipt.transactionHash.toLowerCase(), settles.filter((s) => squads.has(s.squad)), credits.filter((c) => squads.has(c.squad)), (s, m, when) => owed.get(`${s}:${m}:${when}`) ?? BigInt(0));
  if (!alerts.length) return;
  const who = await people(alerts.map((a) => a.member));
  for (const a of alerts) {
    const p = who.get(a.member);
    if (!p) continue; // no profile row: no name, language or inbox
    const body = tr(p.lang, KEYS[a.stage], { round: a.round, squad: squads.get(a.squad)!.name, amount: naira(fromUnits(a.amount)) });
    await sql`insert into notifications (member, squad, round, stage, channel, body, ref)
      values (${a.member}, ${a.squad}, ${a.round}, ${a.stage}, 'inapp', ${body}, ${a.ref}) on conflict do nothing`;
  }
}
