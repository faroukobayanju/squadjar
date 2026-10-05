// Money history: one row per member per sNGN movement, read from a receipt's logs. Shared by POST /api/activity and
// scripts/backfill-activity.mjs so both agree. Runtime imports are only `viem`, so node runs it without a bundler.
import { formatUnits, parseEventLogs, type Hex, type PublicClient, type TransactionReceipt } from "viem";

export const EVENTS = [
  {type:"event",name:"Transfer",anonymous:false,inputs:[{indexed:true,name:"from",type:"address"},{indexed:true,name:"to",type:"address"},{indexed:false,name:"value",type:"uint256"}]},
  {type:"event",name:"DepositLocked",anonymous:false,inputs:[{indexed:true,name:"member",type:"address"},{indexed:false,name:"amount",type:"uint256"}]},
  {type:"event",name:"Contributed",anonymous:false,inputs:[{indexed:true,name:"member",type:"address"},{indexed:false,name:"round",type:"uint8"},{indexed:false,name:"late",type:"bool"}]},
  {type:"event",name:"RoundSettled",anonymous:false,inputs:[{indexed:false,name:"round",type:"uint8"},{indexed:true,name:"collector",type:"address"},{indexed:false,name:"amount",type:"uint256"},{indexed:false,name:"missed",type:"address[]"}]},
  {type:"event",name:"StoppedPaying",anonymous:false,inputs:[{indexed:true,name:"member",type:"address"}]},
] as const;
const STOPPED = [{type:"function",name:"stoppedPaying",inputs:[{name:"",type:"address"}],outputs:[{name:"",type:"bool"}],stateMutability:"view"}] as const;
const ISSQUAD = [{type:"function",name:"isSquad",inputs:[{name:"",type:"address"}],outputs:[{name:"",type:"bool"}],stateMutability:"view"}] as const;
const CONTRIBUTION = [{type:"function",name:"contribution",inputs:[],outputs:[{name:"",type:"uint256"}],stateMutability:"view"}] as const;

/** The factory before the 2026-10-04 redeploy; its squads have real history. */
export const LEGACY_FACTORY = "0x2bf6b051e25E3Aa65AE55D8367500BBcBA50fdf5";
export const LEGACY_DEPLOY_BLOCK = BigInt(68377230);

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";

export type Kind = "topup" | "deposit" | "contribution" | "payout" | "refund" | "covered" | "withdraw" | "sent" | "received" | "stopped";
export type Row = { logIndex: number; member: string; kind: Kind; amount: bigint; squad: string | null; round: number | null };
type RawLog = { address: string; topics: readonly Hex[] | [Hex, ...Hex[]] | []; data: Hex; logIndex: number | null };
/** `stoppedBefore(squad, member)`: the member was already marked stopped paying before this tx. */
export type Ctx = { token: string; isSquad: (a: string) => boolean; contribution: (squad: string) => bigint; stoppedBefore?: (squad: string, member: string) => boolean };

function decode(logs: readonly RawLog[]) {
  return parseEventLogs({ abi: EVENTS, logs: logs as never, strict: true }).map((l) => ({ ...l, address: l.address.toLowerCase(), logIndex: Number(l.logIndex) }));
}

/** Every address whose isSquad answer classify() needs, and the squads whose contribution() it needs. */
export function lookups(logs: readonly RawLog[], token: string) {
  const ev = decode(logs);
  const addrs = new Set<string>();
  for (const l of ev) {
    if (l.eventName === "Transfer") {
      if (l.address !== token.toLowerCase()) continue;
      for (const a of [l.args.from, l.args.to].map((x) => x.toLowerCase())) if (a !== ZERO && a !== DEAD) addrs.add(a);
    } else addrs.add(l.address);
  }
  const settled = ev.filter((l) => l.eventName === "RoundSettled" && l.args.missed.length).map((l) => l.address);
  return { addrs: [...addrs], settled: [...new Set(settled)] };
}

/** Pure. Amounts stay in base units; squad events count only when emitted by a squad. */
export function classify(logs: readonly RawLog[], { token, isSquad, contribution, stoppedBefore = () => false }: Ctx): Row[] {
  const ev = decode(logs);
  const sq = (a: string) => a !== ZERO && a !== DEAD && isSquad(a);
  const transfers = ev.flatMap((l) => (l.eventName === "Transfer" && l.address === token.toLowerCase() ? [{ i: l.logIndex, from: l.args.from.toLowerCase(), to: l.args.to.toLowerCase(), v: l.args.value }] : []));
  const fromSquad = ev.filter((l) => l.address !== token.toLowerCase() && sq(l.address));
  const deposited = new Set(fromSquad.flatMap((l) => (l.eventName === "DepositLocked" ? [`${l.address}:${l.args.member.toLowerCase()}`] : [])));
  const roundOf = new Map<string, number>(fromSquad.flatMap((l) => (l.eventName === "Contributed" ? [[`${l.address}:${l.args.member.toLowerCase()}`, l.args.round] as const] : [])));
  const settles = fromSquad.flatMap((l) => (l.eventName === "RoundSettled" ? [{ ...l, args: l.args }] : []));
  // The payout is the squad -> collector transfer right before its RoundSettled; later ones in the tx are _finish refunds.
  const payouts = new Map<number, number>();
  for (const s of settles) {
    const t = transfers.filter((t) => t.i < s.logIndex && t.from === s.address && t.to === s.args.collector.toLowerCase()).at(-1);
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
      const k = `${to}:${from}`;
      if (deposited.has(k)) add(i, from, "deposit", v, to);
      else add(i, from, "contribution", v, to, roundOf.get(k) ?? null);
    } else if (sq(from) && !sq(to) && to !== ZERO && to !== DEAD) {
      const r = payouts.get(i);
      add(i, to, r === undefined ? "refund" : "payout", v, from, r ?? null);
    } else if (!sq(from) && to === DEAD) {
      add(i, from, "withdraw", v);
    } else if (!sq(from) && !sq(to) && to !== ZERO) {
      add(i, from, "sent", v);
      add(i, to, "received", v);
    }
  }
  // A miss moves no sNGN (the deposit covers it inside the jar), so it gets its own row. Members who stopped paying
  // (now or earlier) get no row: the contract covers them partly or not at all, so a full contribution would be wrong.
  const stops = fromSquad.flatMap((l) => (l.eventName === "StoppedPaying" ? [{ i: l.logIndex, squad: l.address, member: l.args.member.toLowerCase() }] : []));
  const stoppedNow = new Set(stops.map((s) => `${s.squad}:${s.member}`));
  for (const s of settles)
    for (const raw of s.args.missed) {
      const m = raw.toLowerCase();
      if (stoppedNow.has(`${s.address}:${m}`) || stoppedBefore(s.address, m)) continue;
      add(s.logIndex, m, "covered", contribution(s.address), s.address, s.args.round);
    }
  // Stopped paying follows the member (the record), whatever the squad's size or period. _stop runs inside _settle,
  // so the round is that of the RoundSettled after it in the same tx.
  for (const s of stops) add(s.i, s.member, "stopped", BigInt(0), s.squad, settles.find((x) => x.address === s.squad && x.logIndex > s.i)?.args.round ?? null);
  return rows;
}

export type DbRow = { tx: string; log_index: number; member: string; kind: Kind; amount: string; squad: string | null; round: number | null; block: string; at: string };

/** Reads what classify() needs from the chain (isSquad on every factory, cached in `cache`), then classifies. */
export async function rowsFor(client: PublicClient, receipt: TransactionReceipt, factories: readonly string[], token: string, cache = new Map<string, boolean>()): Promise<DbRow[]> {
  if (receipt.status !== "success") return [];
  const { addrs, settled } = lookups(receipt.logs, token);
  const todo = addrs.filter((a) => !cache.has(a));
  if (todo.length) {
    const res = await client.multicall({
      allowFailure: false,
      contracts: todo.flatMap((a) => factories.map((f) => ({ address: f as Hex, abi: ISSQUAD, functionName: "isSquad", args: [a as Hex] }) as const)),
    });
    todo.forEach((a, j) => cache.set(a, res.slice(j * factories.length, (j + 1) * factories.length).some(Boolean)));
  }
  const isSquad = (a: string) => cache.get(a) ?? false;
  const contrib = new Map<string, bigint>();
  for (const s of settled.filter(isSquad)) contrib.set(s, await client.readContract({ address: s as Hex, abi: CONTRIBUTION, functionName: "contribution" }));
  // Who was already stopped before this tx: read stoppedPaying at the previous block for each missed member.
  const stopped = new Set<string>();
  for (const l of decode(receipt.logs)) {
    if (l.eventName !== "RoundSettled" || !isSquad(l.address)) continue;
    const missed = (l.args as { missed: readonly Hex[] }).missed;
    if (!missed.length) continue;
    const res = await client.multicall({
      allowFailure: false,
      blockNumber: receipt.blockNumber - BigInt(1),
      contracts: missed.map((m) => ({ address: l.address as Hex, abi: STOPPED, functionName: "stoppedPaying", args: [m] }) as const),
    });
    missed.forEach((m, j) => res[j] && stopped.add(`${l.address}:${m.toLowerCase()}`));
  }
  const rows = classify(receipt.logs, { token, isSquad, contribution: (s) => contrib.get(s) ?? BigInt(0), stoppedBefore: (s, m) => stopped.has(`${s}:${m}`) });
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
    block: receipt.blockNumber.toString(),
    at,
  }));
}

type Sql = { query: (q: string, params: unknown[]) => Promise<unknown> };
/** One idempotent insert; returns how many rows were new. */
export async function insertRows(sql: Sql, rows: DbRow[]): Promise<number> {
  if (!rows.length) return 0;
  const col = <K extends keyof DbRow>(k: K) => rows.map((r) => r[k]);
  const res = (await sql.query(
    `insert into activity (tx, log_index, member, kind, amount, squad, round, block, at)
     select * from unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::numeric[], $6::text[], $7::int[], $8::bigint[], $9::timestamptz[])
     on conflict do nothing returning 1`,
    [col("tx"), col("log_index"), col("member"), col("kind"), col("amount"), col("squad"), col("round"), col("block"), col("at")],
  )) as unknown[];
  return res.length;
}
