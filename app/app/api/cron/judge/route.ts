import { timingSafeEqual } from "node:crypto";
import { hasDb } from "@/lib/db";
import { judgeConfigured, runJudge } from "@/lib/judge";

const same = (a: string | null, b: string) => {
  const x = Buffer.from(a ?? "");
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const json = (body: unknown, status: number) => Response.json(body, { status });

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !same(req.headers.get("x-cron-secret"), secret)) return json({ error: "unauthorized" }, 401);
  if (!judgeConfigured() || !hasDb) return json({ error: "judge bots not configured" }, 503);
  try {
    return json(await runJudge(), 200);
  } catch (e) {
    console.error("cron judge failed", e);
    return json({ error: "server error" }, 500);
  }
}
