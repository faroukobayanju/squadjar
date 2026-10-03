import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";

export const POST = route(async (req: Request) => {
  const me = await requireUser(req);
  const body = await req.json().catch(() => null);
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  if (displayName.length < 1 || displayName.length > 30) return bad("name must be 1 to 30 characters");
  await sql`insert into users (privy_id, address, display_name, email) values (${me.privyId}, ${me.address}, ${displayName}, ${me.email ?? null})
    on conflict (privy_id) do update set address = excluded.address, display_name = excluded.display_name, email = excluded.email`;
  return Response.json({ ok: true });
});
