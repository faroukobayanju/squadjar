import { isAddress, type Address } from "viem";
import { bad, route } from "@/lib/auth-server";
import { recordsOf } from "@/lib/record";

/** Public by design: anyone can see how someone has paid before letting them in. */
export const GET = route(async (req: Request) => {
  const a = (new URL(req.url).searchParams.get("a") ?? "").split(",").filter(Boolean).map((x) => x.toLowerCase());
  if (!a.length || a.length > 50 || !a.every((x) => isAddress(x))) return bad("bad addresses");
  return Response.json(await recordsOf(a as Address[]));
});
