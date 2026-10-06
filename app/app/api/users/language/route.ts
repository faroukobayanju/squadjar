import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { isLang } from "@/lib/i18n/core";

/** The signed-in user's saved language, or null before they've finished sign-up. */
export const GET = route(async (req: Request) => {
  const me = await requireUser(req);
  const [row] = await sql`select language from users where privy_id = ${me.privyId}`;
  return Response.json({ language: row?.language ?? null });
});

export const POST = route(async (req: Request) => {
  const me = await requireUser(req);
  const body = await req.json().catch(() => null);
  if (!isLang(body?.language)) return bad("language must be en, pcm, yo, ig or ha");
  await sql`update users set language = ${body.language} where privy_id = ${me.privyId}`;
  return Response.json({ ok: true });
});
