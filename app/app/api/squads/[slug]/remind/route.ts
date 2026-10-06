import type { Address } from "viem";
import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { fromUnits, publicClient } from "@/lib/live/chain";
import { squadAbi } from "@/lib/live/abi";
import { naira } from "@/lib/format";
import { compose, payLink, people, tr } from "@/lib/messages";

// ponytail: per-instance memory, so each serverless instance writes its own; move to the DB if Kimi spend matters.
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { message: string; at: number }>();

/** POST (member) -> { message, waLink }: a WhatsApp group message in the caller's language naming who still owes this round. */
export const POST = route(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const me = await requireUser(req);
  const { slug } = await ctx.params;
  const [row] = await sql`select address, name from squads where slug = ${slug}`;
  if (!row) return bad("not found", 404);
  const v = await publicClient.readContract({ address: row.address as Address, abi: squadAbi, functionName: "getState" });
  const members = v.members.map((m) => m.toLowerCase());
  if (!members.includes(me.address)) return bad("forbidden", 403);
  if (v.state !== 2) return bad("not active", 409); // 2 = Active: only then does anyone owe a contribution
  const waiting = members.filter((m, i) => !v.paidThisRound[i] && !v.stopped[i] && m !== me.address);
  if (!waiting.length) return bad("everyone has paid", 409);

  const who = await people([...waiting, members[v.currentRound - 1], me.address]); // turn order: index r-1 collects round r
  const nameOf = (a: string) => who.get(a)?.name ?? "A member";
  const lang = who.get(me.address)?.lang ?? "en";
  const link = payLink(slug);
  const key = [row.address, v.currentRound, [...waiting].sort().join(","), lang].join(":");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return reply(hit.message);
  const facts = {
    squad: row.name,
    contribution: naira(fromUnits(v.contribution)),
    round: v.currentRound,
    stillToPay: waiting.map(nameOf),
    collector: nameOf(members[v.currentRound - 1]),
    payLink: link,
  };
  const template = tr(lang, "remindText", { names: facts.stillToPay.join(", "), amount: facts.contribution, squad: row.name, collector: facts.collector, link });
  const message = await compose(
    "Write one short WhatsApp message for the squad's group chat, from a fellow member, reminding the people in stillToPay to pay this round's contribution. Name them. Under 400 characters.",
    facts,
    lang,
    link,
    400,
    template,
  );
  for (const [k, c] of cache) if (Date.now() - c.at >= TTL_MS) cache.delete(k);
  cache.set(key, { message, at: Date.now() });
  return reply(message);
});

const reply = (message: string) => Response.json({ message, waLink: `https://wa.me/?text=${encodeURIComponent(message)}` });
