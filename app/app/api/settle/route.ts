import { isAddress, type Address } from "viem";
import { hasDb, sql } from "@/lib/db";
import { FACTORY, publicClient } from "@/lib/live/chain";
import { factoryAbi } from "@/lib/live/abi";
import { poke, relayerConfigured } from "@/lib/relayer";

const json = (body: unknown, status: number) => Response.json(body, { status });
const WINDOW_MS = 15_000;
// ponytail: per-instance only; used for squads without a DB row, a second instance can double-poke (simulation still protects).
const lastLocal = new Map<string, number>();

/** True when this squad may be poked now; records the attempt first so concurrent calls can't both pass. */
async function allow(squad: string): Promise<boolean> {
  if (hasDb) {
    const hit = await sql`update squads set last_poke = now() where address = ${squad} and (last_poke is null or last_poke < now() - interval '15 seconds') returning address`;
    if (hit.length) return true;
    if ((await sql`select 1 from squads where address = ${squad}`).length) return false;
  }
  const now = Date.now();
  if (now - (lastLocal.get(squad) ?? 0) < WINDOW_MS) return false;
  lastLocal.set(squad, now);
  return true;
}

export async function POST(req: Request) {
  if (!relayerConfigured()) return json({ error: "relayer not configured" }, 503);
  try {
    const body = (await req.json().catch(() => null)) as { squad?: unknown } | null;
    if (typeof body?.squad !== "string" || !isAddress(body.squad)) return json({ error: "bad request" }, 400);
    const squad = body.squad.toLowerCase() as Address;
    const ok = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "isSquad", args: [squad] });
    if (!ok) return json({ error: "bad request" }, 400);
    if (!(await allow(squad))) return json({ error: "too soon" }, 429);
    return json({ result: await poke(squad) }, 200);
  } catch {
    return json({ error: "server error" }, 500);
  }
}
