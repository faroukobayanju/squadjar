import { type Address } from "viem";
import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { publicClient } from "@/lib/live/chain";
import { squadAbi } from "@/lib/live/abi";

export const GET = route(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const me = await requireUser(req);
  const { slug } = await ctx.params;
  // A squad id (lowercase 0x) works in place of the slug: /s/<id> is used until the squad is registered.
  const rows = /^0x[0-9a-f]{40}$/.test(slug)
    ? await sql`select address, invite_code from squads where address = ${slug}`
    : await sql`select address, invite_code from squads where slug = ${slug}`;
  if (!rows[0]) return bad("not found", 404);
  const member = await publicClient.readContract({ address: rows[0].address as Address, abi: squadAbi, functionName: "isMember", args: [me.address] });
  return member ? Response.json({ code: rows[0].invite_code }) : bad("forbidden", 403);
});
