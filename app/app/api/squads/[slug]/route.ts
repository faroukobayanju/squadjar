import { route } from "@/lib/auth-server";
import { sql } from "@/lib/db";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const { slug } = await ctx.params;
  const rows = await sql`select address, name from squads where slug = ${slug}`;
  return rows[0] ? Response.json({ address: rows[0].address, name: rows[0].name }) : Response.json({ error: "not found" }, { status: 404 });
});
