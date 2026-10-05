import { isAddress, type Address } from "viem";
import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { publicClient, readTiers } from "@/lib/live/chain";
import { squadAbi } from "@/lib/live/abi";
import { canRequest, codeReleasable } from "@/lib/public-squads";

type Ctx = { params: Promise<{ slug: string }> };

async function squadOf(ctx: Ctx) {
  const { slug } = await ctx.params;
  const [row] = await sql`select address, invite_code, visibility, min_tier, approval from squads where slug = ${slug}`;
  if (!row) throw bad("not found", 404);
  return row;
}

const isOrganizer = async (squad: string, me: Address) =>
  (await publicClient.readContract({ address: squad as Address, abi: squadAbi, functionName: "organizer" })).toLowerCase() === me;

/** Ask to join a public squad. Without approval the request is accepted at once and the code comes back. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const row = await squadOf(ctx);
  if (row.visibility !== "public") return bad("forbidden", 403);
  const [tier] = await readTiers([me.address]);
  if (!canRequest({ tier, minTier: row.min_tier })) return bad("tier", 403);
  const view = await publicClient.readContract({ address: row.address as Address, abi: squadAbi, functionName: "getState" });
  if (view.state !== 0) return bad("started", 409); // 0 = Open; joining a started squad would fail anyway

  // A repeat request never downgrades accepted and never revives declined (with or without approval).
  const [{ status }] = row.approval
    ? await sql`insert into join_requests (squad, member, status) values (${row.address}, ${me.address}, 'pending')
        on conflict (squad, member) do update set status = join_requests.status returning status`
    : await sql`insert into join_requests (squad, member, status) values (${row.address}, ${me.address}, 'accepted')
        on conflict (squad, member) do update set status = case when join_requests.status = 'declined' then 'declined' else 'accepted' end returning status`;
  const code = codeReleasable({ isMember: false, isPublic: true, tier, minTier: row.min_tier, requestStatus: status }) ? row.invite_code : undefined;
  return Response.json({ status, code });
});

/** Organizer: the pending requests with names and tiers. Anyone else: their own request's status (null when none). */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const row = await squadOf(ctx);
  if (!(await isOrganizer(row.address, me.address))) {
    const [mine] = await sql`select status from join_requests where squad = ${row.address} and member = ${me.address}`;
    return Response.json({ status: mine?.status ?? null });
  }
  const pending = await sql`select r.member, u.display_name from join_requests r left join users u on u.address = r.member
    where r.squad = ${row.address} and r.status = 'pending' order by r.created_at`;
  const tiers = await readTiers(pending.map((p) => p.member as Address));
  return Response.json({ requests: pending.map((p, i) => ({ member: p.member, name: p.display_name ?? "Someone", tier: tiers[i] })) });
});

/** Organizer only (checked onchain): accept or decline one request. */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const me = await requireUser(req);
  const body = await req.json().catch(() => null);
  const member = typeof body?.member === "string" ? body.member.toLowerCase() : "";
  const decision = body?.decision;
  if (!isAddress(member) || (decision !== "accepted" && decision !== "declined")) return bad();
  const row = await squadOf(ctx);
  if (!(await isOrganizer(row.address, me.address))) return bad("forbidden", 403);
  const done = await sql`update join_requests set status = ${decision} where squad = ${row.address} and member = ${member} returning 1`;
  return done.length ? Response.json({ status: decision }) : bad("not found", 404);
});
