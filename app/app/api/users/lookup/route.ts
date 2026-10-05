import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { normUsername } from "@/lib/money-out";

/** Signed in: find someone to send to by @username. 404 when nobody has it. */
export const GET = route(async (req: Request) => {
  await requireUser(req);
  const u = normUsername(new URL(req.url).searchParams.get("u") ?? "");
  if (!u) return bad("bad username");
  const [row] = await sql`select display_name, username, address from users where lower(username) = ${u}`;
  if (!row) return bad("not found", 404);
  return Response.json({ displayName: row.display_name, username: row.username, address: row.address });
});
