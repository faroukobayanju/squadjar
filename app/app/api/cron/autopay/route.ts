import { timingSafeEqual } from "node:crypto";
import { autopayConfigured, runAutopay } from "@/lib/autopay";

const same = (a: string | null, b: string) => {
  const x = Buffer.from(a ?? "");
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const json = (body: unknown, status: number) => Response.json(body, { status });

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !same(req.headers.get("x-cron-secret"), secret)) return json({ error: "unauthorized" }, 401);
  if (!autopayConfigured()) return json({ error: "auto-pay not configured" }, 503);
  try {
    return json(await runAutopay(), 200);
  } catch {
    return json({ error: "server error" }, 500);
  }
}
