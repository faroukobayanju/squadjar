import { type Address } from "viem";
import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { publicClient, readTiers } from "@/lib/live/chain";
import { squadAbi } from "@/lib/live/abi";
import { codeReleasable } from "@/lib/public-squads";
import type { RequestStatus } from "@/lib/types";

export const GET = route(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const me = await requireUser(req);
  const { slug } = await ctx.params;
  // A squad id (lowercase 0x) works in place of the slug: /s/<id> is used until the squad is registered.
  const rows = /^0x[0-9a-f]{40}$/.test(slug)
    ? await sql`select address, invite_code, visibility, min_tier from squads where address = ${slug}`
    : await sql`select address, invite_code, visibility, min_tier from squads where slug = ${slug}`;
  const row = rows[0];
  if (!row) return bad("not found", 404);
  const isMember = await publicClient.readContract({ address: row.address as Address, abi: squadAbi, functionName: "isMember", args: [me.address] });
  const isPublic = row.visibility === "public";
  let tier = 0;
  let requestStatus: RequestStatus | null = null;
  if (!isMember && isPublic) {
    const [req] = await sql`select status from join_requests where squad = ${row.address} and member = ${me.address}`;
    requestStatus = req?.status ?? null;
    if (requestStatus === "accepted") [tier] = await readTiers([me.address]);
  }
  return codeReleasable({ isMember, isPublic, tier, minTier: row.min_tier, requestStatus })
    ? Response.json({ code: row.invite_code })
    : bad("forbidden", 403);
});
