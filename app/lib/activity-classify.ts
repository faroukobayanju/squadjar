// Money history: one row per member per sNGN movement, read from a receipt's logs. Shared by POST /api/activity and
// scripts/backfill-activity.mjs so both agree. Runtime imports are only `viem`, so node runs it without a bundler.
import { formatUnits, parseEventLogs, type Hex, type PublicClient, type TransactionReceipt } from "viem";

export const EVENTS = [
  {type:"event",name:"Transfer",anonymous:false,inputs:[{indexed:true,name:"from",type:"address"},{indexed:true,name:"to",type:"address"},{indexed:false,name:"value",type:"uint256"}]},
  {type:"event",name:"Contributed",anonymous:false,inputs:[{indexed:true,name:"member",type:"address"},{indexed:false,name:"round",type:"uint8"},{indexed:false,name:"late",type:"bool"}]},
  {type:"event",name:"RoundSettled",anonymous:false,inputs:[{indexed:false,name:"round",type:"uint8"},{indexed:true,name:"collector",type:"address"},{indexed:false,name:"amount",type:"uint256"},{indexed:false,name:"missed",type:"address[]"}]},
  {type:"event",name:"PayoutHeld",anonymous:false,inputs:[{indexed:true,name:"member",type:"address"},{indexed:false,name:"round",type:"uint8"},{indexed:false,name:"amount",type:"uint256"}]},
  {type:"event",name:"PaidBack",anonymous:false,inputs:[{indexed:true,name:"member",type:"address"},{indexed:false,name:"amount",type:"uint256"}]},
  {type:"event",name:"CreditPaid",anonymous:false,inputs:[{indexed:true,name:"member",type:"address"},{indexed:false,name:"amount",type:"uint256"}]},
] as const;
const ISSQUAD = [{type:"function",name:"isSquad",inputs:[{name:"",type:"address"}],outputs:[{name:"",type:"bool"}],stateMutability:"view"}] as const;

/** Superseded factories (deposit era); their squads keep real history. Oldest first. */
export const LEGACY_FACTORIES = ["0x2bf6b051e25E3Aa65AE55D8367500BBcBA50fdf5", "0x7B2aC330515073De9aCB8883ee0AAA8cE11B5d4B"];
export const LEGACY_DEPLOY_BLOCK = BigInt(68377230);

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";

/**
 * held: part of a payout kept in the jar (no money moves). refund: held money back at the end. payback: a member
 * clearing their debt. credit: a short-paid collector getting it back. covered and stopped exist only in rows
 * indexed from deposit-era squads; nothing produces them now.
 */
export type Kind = "topup" | "contribution" | "payout" | "held" | "refund" | "payback" | "credit" | "withdraw" | "sent" | "received" | "covered" | "stopped";
/** `counterparty` only on sent/received: the other member. */
export type Row = { logIndex: number; member: string; kind: Kind; amount: bigint; squad: string | null; round: number | null; counterparty?: string };
type RawLog = { address: string; topics: readonly Hex[] | [Hex, ...Hex[]] | []; data: Hex; logIndex: number | null };
export type Ctx = { token: string; isSquad: (a: string) => boolean };

export function decode(logs: readonly RawLog[]) {
  return parseEventLogs({ abi: EVENTS, logs: logs as never, strict: true }).map((l) => ({ ...l, address: l.address.toLowerCase(), logIndex: Number(l.logIndex) }));
}

/** Every address whose isSquad answer classify() needs. */
export function lookups(logs: readonly RawLog[], token: string): string[] {
  const addrs = new Set<string>();
  for (const l of decode(logs)) {
    if (l.eventName === "Transfer") {
      if (l.address !== token.toLowerCase()) continue;
      for (const a of [l.args.from, l.args.to].map((x) => x.toLowerCase())) if (a !== ZERO && a !== DEAD) addrs.add(a);
    } else addrs.add(l.address);
  }
  return [...addrs];
}

/** Pure. Amounts stay in base units; squad events count only when emitted by a squad. */
export function classify(logs: readonly RawLog[], { token, isSquad }: Ctx): Row[] {
  const ev = decode(logs);
  const sq = (a: string) => a !== ZERO && a !== DEAD && isSquad(a);
  const transfers = ev.flatMap((l) => (l.eventName === "Transfer" && l.address === token.toLowerCase() ? [{ i: l.logIndex, from: l.args.from.toLowerCase(), to: l.args.to.toLowerCase(), v: l.args.value }] : []));
  const fromSquad = ev.filter((l) => l.address !== token.toLowerCase() && sq(l.address));
  const key = (squad: string, member: string) => `${squad}:${member.toLowerCase()}`;
  const paidBack = new Set(fromSquad.flatMap((l) => (l.eventName === "PaidBack" ? [key(l.address, l.args.member)] : [])));
  const roundOf = new Map<string, number>(fromSquad.flatMap((l) => (l.eventName === "Contributed" ? [[key(l.address, l.args.member), l.args.round] as const] : [])));
  // _payCredits emits CreditPaid right after each transfer it makes.
  const credits = new Set(
    fromSquad.flatMap((l) => (l.eventName === "CreditPaid" ? transfers.filter((t) => t.i < l.logIndex && t.from === l.address && t.to === l.args.member.toLowerCase()).slice(-1).map((t) => t.i) : [])),
  );
  const settles = fromSquad.flatMap((l) => (l.eventName === "RoundSettled" ? [{ ...l, args: l.args }] : []));
  // The payout is the squad -> collector transfer right before its RoundSettled; later ones in the tx return held money.
  const payouts = new Map<number, number>();
  for (const s of settles) {
    const t = transfers.filter((t) => t.i < s.logIndex && t.from === s.address && t.to === s.args.collector.toLowerCase() && !credits.has(t.i)).at(-1);
    if (t) payouts.set(t.i, s.args.round);
  }

  const rows: Row[] = [];
  const add = (logIndex: number, member: string, kind: Kind, amount: bigint, squad: string | null = null, round: number | null = null) =>
    rows.push({ logIndex, member, kind, amount, squad, round });
  for (const { i, from, to, v } of transfers) {
    if (from === to) continue;
    if (from === ZERO) {
      if (!sq(to)) add(i, to, "topup", v);
    } else if (sq(to) && !sq(from)) {
      const k = key(to, from);
      if (paidBack.has(k)) add(i, from, "payback", v, to);
      else add(i, from, "contribution", v, to, roundOf.get(k) ?? null);
    } else if (sq(from) && !sq(to) && to !== ZERO && to !== DEAD) {
      const r = payouts.get(i);
      add(i, to, credits.has(i) ? "credit" : r === undefined ? "refund" : "payout", v, from, r ?? null);
    } else if (!sq(from) && to === DEAD) {
      add(i, from, "withdraw", v);
    } else if (!sq(from) && !sq(to) && to !== ZERO) {
      rows.push({ logIndex: i, member: from, kind: "sent", amount: v, squad: null, round: null, counterparty: to });
      rows.push({ logIndex: i, member: to, kind: "received", amount: v, squad: null, round: null, counterparty: from });
    }
  }
  // Held money stays in the jar, so no sNGN moves: it gets its own row.
  for (const l of fromSquad) if (l.eventName === "PayoutHeld") add(l.logIndex, l.args.member.toLowerCase(), "held", l.args.amount, l.address, l.args.round);
  return rows;
}

export type DbRow = { tx: string; log_index: number; member: string; kind: Kind; amount: string; squad: string | null; round: number | null; counterparty: string | null; block: string; at: string };

/** Reads what classify() needs from the chain (isSquad on every factory, cached in `cache`), then classifies. */
export async function rowsFor(client: PublicClient, receipt: TransactionReceipt, factories: readonly string[], token: string, cache = new Map<string, boolean>()): Promise<DbRow[]> {
  if (receipt.status !== "success") return [];
  const todo = lookups(receipt.logs, token).filter((a) => !cache.has(a));
  if (todo.length) {
    const res = await client.multicall({
      allowFailure: false,
      contracts: todo.flatMap((a) => factories.map((f) => ({ address: f as Hex, abi: ISSQUAD, functionName: "isSquad", args: [a as Hex] }) as const)),
    });
    todo.forEach((a, j) => cache.set(a, res.slice(j * factories.length, (j + 1) * factories.length).some(Boolean)));
  }
  const rows = classify(receipt.logs, { token, isSquad: (a) => cache.get(a) ?? false });
  if (!rows.length) return [];
  const { timestamp } = await client.getBlock({ blockNumber: receipt.blockNumber });
  const at = new Date(Number(timestamp) * 1000).toISOString();
  return rows.map((r) => ({
    tx: receipt.transactionHash.toLowerCase(),
    log_index: r.logIndex,
    member: r.member,
    kind: r.kind,
    amount: formatUnits(r.amount, 18), // whole naira, exact
    squad: r.squad,
    round: r.round,
    counterparty: r.counterparty ?? null,
    block: receipt.blockNumber.toString(),
    at,
  }));
}

type Sql = { query: (q: string, params: unknown[]) => Promise<unknown> };
/** One idempotent insert; returns how many rows were new. Re-runs fill in a counterparty that older rows lack. */
export async function insertRows(sql: Sql, rows: DbRow[]): Promise<number> {
  if (!rows.length) return 0;
  const col = <K extends keyof DbRow>(k: K) => rows.map((r) => r[k]);
  const res = (await sql.query(
    `insert into activity (tx, log_index, member, kind, amount, squad, round, block, at, counterparty)
     select * from unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::numeric[], $6::text[], $7::int[], $8::bigint[], $9::timestamptz[], $10::text[])
     on conflict (tx, log_index, member) do update set counterparty = excluded.counterparty
       where activity.counterparty is null and excluded.counterparty is not null
     returning (xmax = 0) as inserted`,
    [col("tx"), col("log_index"), col("member"), col("kind"), col("amount"), col("squad"), col("round"), col("block"), col("at"), col("counterparty")],
  )) as { inserted: boolean }[];
  return res.filter((r) => r.inserted).length;
}
