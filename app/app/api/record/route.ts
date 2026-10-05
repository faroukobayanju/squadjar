import { isAddress, type Address } from "viem";
import { bad, route } from "@/lib/auth-server";
import { hasDb } from "@/lib/db";
import { recordsOf } from "@/lib/record";

/** Public by design: anyone can see how someone has paid before letting them in. */
export const GET = route(async (req: Request) => {
  const a = (new URL(req.url).searchParams.get("a") ?? "").split(",").filter(Boolean).map((x) => x.toLowerCase());
  if (!hasDb) return bad("not configured", 503);
  if (!a.length || a.length > 50 || !a.every((x) => isAddress(x))) return bad("bad addresses");
  // Records change at most once a round; a short shared cache keeps polling pages from re-reading the chain each tick.
  return Response.json(await recordsOf(a as Address[]), { headers: { "cache-control": "public, s-maxage=15, stale-while-revalidate=30" } });
});
