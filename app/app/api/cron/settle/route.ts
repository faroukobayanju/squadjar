import { FACTORY, publicClient } from "@/lib/live/chain";
import { factoryAbi } from "@/lib/live/abi";
import { poke, relayerConfigured } from "@/lib/relayer";

const json = (body: unknown, status: number) => Response.json(body, { status });

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "unauthorized" }, 401);
  if (!relayerConfigured()) return json({ error: "relayer not configured" }, 503);
  try {
    const n = Number(await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "squadCount" }));
    let settled = 0;
    let finalized = 0;
    // ponytail: sequential walk of every squad; fine at hundreds, shard or index by state past ~1k.
    for (let i = 0; i < n; i++) {
      const a = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "squads", args: [BigInt(i)] });
      const r = await poke(a).catch(() => "nothing");
      if (r === "settled") settled++;
      else if (r === "finalized") finalized++;
    }
    return json({ settled, finalized }, 200);
  } catch {
    return json({ error: "server error" }, 500);
  }
}
