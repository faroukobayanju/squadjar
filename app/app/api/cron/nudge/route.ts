import { timingSafeEqual } from "node:crypto";
import type { Address } from "viem";
import { hasDb, sql } from "@/lib/db";
import { fromUnits, publicClient } from "@/lib/live/chain";
import { squadAbi } from "@/lib/live/abi";
import { periodOf } from "@/lib/chain-map";
import { dueLabel, naira } from "@/lib/format";
import { compose, payLink, people, tr } from "@/lib/messages";
import { nudgeKey, stageAt, toNudge } from "@/lib/nudge-plan";

const same = (a: string | null, b: string) => {
  const x = Buffer.from(a ?? "");
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const json = (body: unknown, status: number) => Response.json(body, { status });

/** Sends due pay nudges (in-app) to unpaid members of Active squads, once per member, round and stage. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !same(req.headers.get("x-cron-secret"), secret)) return json({ error: "unauthorized" }, 401);
  if (!hasDb) return json({ error: "not configured" }, 503);
  try {
    // Only squads with a row can be nudged (notifications.squad references squads).
    const squads = await sql`select address, slug, name from squads`;
    const views = await publicClient.multicall({
      allowFailure: true,
      contracts: squads.map((s) => ({ address: s.address as Address, abi: squadAbi, functionName: "getState" }) as const),
    });
    const now = Math.floor(Date.now() / 1000);
    let sent = 0;
    // ponytail: one pass over every squad per minute, members written in parallel per squad; queue the Kimi calls past ~100 active squads.
    for (const [i, s] of squads.entries()) {
      const r = views[i];
      if (r.status !== "success" || r.result.state !== 2) continue; // 2 = Active
      const v = r.result;
      const period = periodOf(v.roundLength);
      const deadline = Number(v.roundDeadline);
      const stage = stageAt(period, deadline, v.grace, now);
      if (!stage) continue;
      const squad = (s.address as string).toLowerCase();
      const round = v.currentRound;
      const unpaid = v.members.filter((_, j) => !v.paidThisRound[j] && !v.stopped[j]).map((m) => m.toLowerCase());
      const done = await sql`select member from notifications where squad = ${squad} and round = ${round} and stage = ${stage} and channel = 'inapp'`;
      const todo = toNudge(unpaid, squad, round, stage, new Set(done.map((d) => nudgeKey(d.member, squad, round, stage))));
      if (!todo.length) continue;
      const who = await people(todo);
      const link = payLink(s.slug);
      const amount = naira(fromUnits(v.contribution));
      // "missed" fires during grace: the last moment paying still counts, so `when` is the end of grace.
      const whenAt = (stage === "missed" ? deadline + v.grace : deadline) * 1000;
      await Promise.all(
        todo.map(async (m) => {
          const { name, lang } = who.get(m) ?? { name: "", lang: "en" as const };
          const vars = { name: name.slice(0, 24), amount, squad: s.name, when: dueLabel(whenAt, lang), link };
          const template = tr(lang, stage === "missed" ? "nudgeLate" : "nudgeSoon", vars);
          const body = await compose(
            stage === "missed"
              ? "Write one short, kind message to this member: their contribution for this round is late. They can still pay before `when`, after that it counts as a miss and their deposit covers it."
              : "Write one short, friendly message to this member reminding them their contribution is due at `when`.",
            vars,
            lang,
            link,
            280,
            template,
          );
          const ins = await sql`insert into notifications (member, squad, round, stage, channel, body)
            values (${m}, ${squad}, ${round}, ${stage}, 'inapp', ${body}) on conflict do nothing returning member`;
          sent += ins.length;
        }),
      );
    }
    return json({ sent }, 200);
  } catch (e) {
    console.error("cron nudge failed", e);
    return json({ error: "server error" }, 500);
  }
}
