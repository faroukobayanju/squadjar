import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { isLang, type Lang } from "@/lib/i18n/core";
import { draftSquad } from "@/lib/kimi";

// ponytail: in-memory sliding window per instance, so the real ceiling is 10/min x instances; use a shared store if abused.
const LIMIT = 10;
const WINDOW_MS = 60_000;
const recent = new Map<string, number[]>();
function allow(user: string) {
  const now = Date.now();
  const hits = (recent.get(user) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= LIMIT) return false;
  hits.push(now);
  recent.set(user, hits);
  if (recent.size > 10_000) for (const [k, v] of recent) if (!v.some((t) => now - t < WINDOW_MS)) recent.delete(k);
  return true;
}

/** POST { text, language? } -> { draft | null, followUp?, warnings } (issue #16). Kimi failing is never an error: draft null. */
export const POST = route(async (req: Request) => {
  const me = await requireUser(req);
  const body = (await req.json().catch(() => null)) as { text?: unknown; language?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 500) return bad("text must be 1 to 500 characters");
  if (!allow(me.privyId)) return bad("too many drafts, try again in a minute", 429); // the screen falls back to the pattern parser
  let lang: Lang = "en";
  if (isLang(body?.language)) lang = body.language;
  else {
    const [row] = await sql`select language from users where privy_id = ${me.privyId}`.catch(() => []);
    if (isLang(row?.language)) lang = row.language;
  }
  return Response.json(await draftSquad(text, lang));
});
