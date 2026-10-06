import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { isLang } from "@/lib/i18n/core";

export const POST = route(async (req: Request) => {
  const me = await requireUser(req);
  const body = await req.json().catch(() => null);
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
  if (displayName.length < 1 || displayName.length > 30) return bad("name must be 1 to 30 characters");
  const username = typeof body?.username === "string" ? body.username.trim().replace(/^@/, "").toLowerCase() : "";
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return bad("username must be 3 to 20 letters, numbers or _");
  const [taken] = await sql`select 1 from users where lower(username) = ${username} and privy_id <> ${me.privyId}`;
  const language = isLang(body?.language) ? body.language : null;
  if (taken) return Response.json({ error: "username taken" }, { status: 409 });
  await sql`insert into users (privy_id, address, display_name, username, email, language) values (${me.privyId}, ${me.address}, ${displayName}, ${username}, ${me.email ?? null}, ${language ?? "en"})
    on conflict (privy_id) do update set address = excluded.address, display_name = excluded.display_name, username = excluded.username, email = coalesce(excluded.email, users.email), language = coalesce(${language}, users.language)`;
  return Response.json({ ok: true });
});
