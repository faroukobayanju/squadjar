import { hasDb } from "@/lib/db";
import { currentJudgeSquad, judgeConfigured } from "@/lib/judge";

const json = (body: unknown, status: number) => Response.json(body, { status });

/** Public on purpose: the demo squad's invite code is meant to be shared with judges. */
export async function GET(req: Request) {
  if (!judgeConfigured() || !hasDb) return json({ error: "judge bots not configured" }, 503);
  try {
    const s = await currentJudgeSquad();
    if (!s) return json({ error: "getting ready" }, 503);
    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
    return json({ slug: s.slug, code: s.code, joinUrl: `${origin}/s/${s.slug}?code=${s.code}` }, 200);
  } catch (e) {
    console.error("judge squad lookup failed", e);
    return json({ error: "server error" }, 500);
  }
}
