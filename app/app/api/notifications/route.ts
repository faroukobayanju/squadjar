import { requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";

/** The signed-in member's latest in-app nudges: [{ squad, slug, squadName, body, sentAt }], newest first. */
export const GET = route(async (req: Request) => {
  const me = await requireUser(req);
  const rows = await sql`select n.squad, s.slug, s.name, n.body, n.sent_at from notifications n join squads s on s.address = n.squad
    where n.member = ${me.address} and n.channel = 'inapp' order by n.sent_at desc limit 20`;
  return Response.json(rows.map((r) => ({ squad: r.squad, slug: r.slug, squadName: r.name, body: r.body, sentAt: r.sent_at })));
});
