import { createWalletClient, encodeAbiParameters, http, keccak256, maxUint256, parseEventLogs, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sql } from "./db";
import { FACTORY, RPC, TOKEN, monadTestnet, publicClient, toUnits } from "./live/chain";
import { factoryAbi, squadAbi, tokenAbi } from "./live/abi";
import { slugify } from "./slug";
import { indexTx } from "./activity";
import { hasSeat, needsNextSquad, planJudgeStep, type BotFn, type JudgeView } from "./judge-plan";

// Two server bots (Ada organizes, Tunde joins) keep a Demo squad with a free seat for judges and play every round.
// Keys: JUDGE_BOT_KEYS = "0xAdaKey,0xTundeKey" (server-only, Sensitive). They pay their own MON fees (funded by the team).
const NAMES = ["Ada", "Tunde"] as const;
const SQUAD_NAME = "Try Squadjar";
const CONTRIBUTION = toUnits(2000);
const LOW = toUnits(20_000);
const FAUCET = toUnits(100_000);

function botAccounts() {
  const keys = (process.env.JUDGE_BOT_KEYS ?? "").split(",").map((k) => k.trim());
  if (keys.length !== 2 || !keys.every((k) => /^0x[0-9a-fA-F]{64}$/.test(k))) return null;
  return keys.map((k) => privateKeyToAccount(k as Hex)) as [ReturnType<typeof privateKeyToAccount>, ReturnType<typeof privateKeyToAccount>];
}
export const judgeConfigured = () => botAccounts() !== null;

type Action = { do: string; by?: string; squad?: string; tx?: Hex; error?: string };

/** Simulate, send, wait, index. Monad charges the gas limit, so margins cost the bots MON:
 *  1.5x only for start() (its trust sort varies with prevrandao), 1.15x for everything else. */
async function send(bot: 0 | 1, call: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }): Promise<Hex> {
  const account = botAccounts()![bot];
  const c = { ...call, account } as never;
  const { request } = await publicClient.simulateContract(c);
  const [num, den] = call.functionName === "start" ? [BigInt(3), BigInt(2)] : [BigInt(23), BigInt(20)];
  const gas = ((await publicClient.estimateContractGas(c)) * num) / den;
  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC) });
  const hash = await wallet.writeContract({ ...(request as object), gas } as never);
  const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
  if (r.status !== "success") throw new Error(`${call.functionName} reverted ${hash}`);
  await indexTx(hash).catch(() => {});
  return hash;
}

async function approveIfNeeded(bot: 0 | 1, squad: Address, amount: bigint) {
  const me = botAccounts()![bot].address;
  const allowance = await publicClient.readContract({ address: TOKEN, abi: tokenAbi, functionName: "allowance", args: [me, squad] });
  if (allowance < amount) await send(bot, { address: TOKEN, abi: tokenAbi, functionName: "approve", args: [squad, maxUint256] });
}

let namesSaved = false;
async function saveBotNames() {
  if (namesSaved) return;
  const bots = botAccounts()!;
  for (const [i, name] of NAMES.entries()) {
    const addr = bots[i].address.toLowerCase();
    await sql`insert into users (privy_id, address, display_name, username) values (${`bot:${name.toLowerCase()}`}, ${addr}, ${name}, ${`${name.toLowerCase()}_bot`})
      on conflict (privy_id) do update set address = excluded.address, display_name = excluded.display_name, username = excluded.username`;
  }
  namesSaved = true;
}

/** Ada creates the next "Try Squadjar" Demo squad (₦2,000, 3 seats) and registers it with its invite code.
 *  ponytail: if the DB insert fails after the create, that squad is orphaned (Ada alone, never handed out) and the next run creates another. */
async function createNext(): Promise<Action> {
  const code = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const inviteHash = keccak256(encodeAbiParameters([{ type: "bytes32" }], [code]));
  const tx = await send(0, { address: FACTORY, abi: factoryAbi, functionName: "createSquad", args: [CONTRIBUTION, 3, 0, inviteHash, BigInt(0)] });
  const receipt = await publicClient.getTransactionReceipt({ hash: tx });
  const [created] = parseEventLogs({ abi: factoryAbi, eventName: "SquadCreated", logs: receipt.logs });
  const addr = created.args.squad.toLowerCase();
  const slug = await slugify(SQUAD_NAME, async (s) => (await sql`select 1 from squads where slug = ${s}`).length > 0);
  await sql`insert into squads (address, slug, name, invite_code, organizer) values (${addr}, ${slug}, ${SQUAD_NAME}, ${code}, ${botAccounts()![0].address.toLowerCase()})`;
  await sql`insert into judge_squads (address, invite_code) values (${addr}, ${code})`;
  return { do: "create", by: NAMES[0], squad: slug, tx };
}

type Row = { address: Address; slug: string; invite_code: Hex };
const allRows = async () => (await sql`select j.address, s.slug, j.invite_code from judge_squads j join squads s using (address) where not j.done order by j.created_at`) as Row[];
const isOurs = (address: Address) => publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "isSquad", args: [address] });
/** Unfinished rows from this factory. Rows from an older factory (its ABI no longer decodes) are marked done. */
async function openRows(): Promise<Row[]> {
  const rows = await allRows();
  const ours = await Promise.all(rows.map((r) => isOurs(r.address)));
  const old = rows.filter((_, i) => !ours[i]).map((r) => r.address);
  if (old.length) await sql`update judge_squads set done = true where address = any(${old})`;
  return rows.filter((_, i) => ours[i]);
}
const viewOf = (address: Address) => publicClient.readContract({ address, abi: squadAbi, functionName: "getState" }) as Promise<JudgeView>;

// One run at a time per instance, one send at a time inside a run, so a bot never reuses a nonce.
// ponytail: per-instance lock; two instances racing can create an extra demo squad (harmless, /api/judge hands out the oldest seat) or waste one fee on a reverted send.
let running: Promise<unknown> = Promise.resolve();

/** One step for every unfinished demo squad, faucet top-ups, and a fresh squad when none has a free seat. */
export function runJudge(): Promise<{ actions: Action[] }> {
  const run = running.then(async () => {
    const bots = botAccounts()!;
    const pair = [bots[0].address, bots[1].address] as const;
    const actions: Action[] = [];
    const attempt = async (a: Omit<Action, "tx" | "error">, fn: () => Promise<Hex | Action>) => {
      try {
        const r = await fn();
        actions.push(typeof r === "string" ? { ...a, tx: r } : r);
      } catch (e) {
        console.error("cron judge: step failed", a, e);
        actions.push({ ...a, error: (e as { shortMessage?: string }).shortMessage ?? String(e).slice(0, 200) }); // one step failing must not stop the rest
      }
    };

    await saveBotNames().catch((e) => console.error("cron judge: bot names", e));

    for (const b of [0, 1] as const) {
      const bal = await publicClient.readContract({ address: TOKEN, abi: tokenAbi, functionName: "balanceOf", args: [pair[b]] });
      if (bal < LOW) await attempt({ do: "faucet", by: NAMES[b] }, () => send(b, { address: TOKEN, abi: tokenAbi, functionName: "faucet", args: [FAUCET] }));
    }

    const now = (await publicClient.getBlock()).timestamp;
    const views: JudgeView[] = [];
    let unread = false;
    for (const row of await openRows()) {
      const v = await viewOf(row.address).catch(() => null);
      if (!v) {
        unread = true;
        continue;
      }
      views.push(v);
      const step = planJudgeStep(v, pair, now);
      if (!step) continue;
      if (step.kind === "finished") {
        await sql`update judge_squads set done = true where address = ${row.address}`;
        actions.push({ do: "finished", squad: row.slug });
        continue;
      }
      const { bot, fn, approve } = step;
      await attempt({ do: fn, by: NAMES[bot], squad: row.slug }, async () => {
        if (approve > BigInt(0)) await approveIfNeeded(bot, row.address, approve);
        const args: Record<BotFn, readonly unknown[] | undefined> = { join: [row.invite_code], start: undefined, contribute: undefined, payBack: undefined };
        return send(bot, { address: row.address, abi: squadAbi, functionName: fn, args: args[fn] });
      });
    }

    // An unreadable squad might be the open one: never create on a guess.
    if (!unread && needsNextSquad(views)) await attempt({ do: "create", by: NAMES[0] }, createNext);
    return { actions };
  });
  running = run.catch(() => {});
  return run;
}

/** The oldest unfinished demo squad that is Open with a free seat, for /api/judge. */
export async function currentJudgeSquad(): Promise<{ slug: string; code: Hex } | null> {
  for (const row of await openRows()) {
    const v = await viewOf(row.address).catch(() => null);
    if (v && hasSeat(v)) return { slug: row.slug, code: row.invite_code };
  }
  return null;
}
