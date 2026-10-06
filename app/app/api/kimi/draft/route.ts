import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { isLang, type Lang } from "@/lib/i18n/core";
import { draftSquad } from "@/lib/kimi";

/** POST { text, language? } -> { draft | null, followUp?, warnings } (issue #16). Kimi failing is never an error: draft null. */
export const POST = route(async (req: Request) => {
  const me = await requireUser(req);
  const body = (await req.json().catch(() => null)) as { text?: unknown; language?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 500) return bad("text must be 1 to 500 characters");
  let lang: Lang = "en";
  if (isLang(body?.language)) lang = body.language;
  else {
    const [row] = await sql`select language from users where privy_id = ${me.privyId}`.catch(() => []);
    if (isLang(row?.language)) lang = row.language;
  }
  return Response.json(await draftSquad(text, lang));
});
