import { isAddress } from "viem";
import { bad, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";

export const GET = route(async (req: Request) => {
  const a = (new URL(req.url).searchParams.get("a") ?? "").split(",").filter(Boolean).map((x) => x.toLowerCase());
  if (a.length > 100 || !a.every((x) => isAddress(x))) return bad("bad addresses");
  const rows = await sql`select address, display_name from users where address = any(${a})`;
  return Response.json(Object.fromEntries(rows.map((r) => [r.address, r.display_name])));
});
