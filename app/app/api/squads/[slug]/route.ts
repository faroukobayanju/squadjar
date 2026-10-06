import { route } from "@/lib/auth-server";
import { sql } from "@/lib/db";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const rows = await sql`select address, name from squads where slug = ${slug}`;
  const r = rows[0];
  if (!r) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ address: r.address, name: r.name });
});
