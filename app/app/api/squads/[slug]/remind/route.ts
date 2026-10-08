import type { Address } from "viem";
import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { fromUnits, publicClient } from "@/lib/live/chain";
import { squadAbi } from "@/lib/live/abi";
import { naira } from "@/lib/format";
import { payLink, people, tr } from "@/lib/messages";

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
  const waiting = members.filter((m, i) => !v.paidThisRound[i] && m !== me.address);
  if (!waiting.length) return bad("everyone has paid", 409);

  const who = await people([...waiting, members[v.currentRound - 1], me.address]); // turn order: index r-1 collects round r
  const nameOf = (a: string) => who.get(a)?.name ?? "A member";
  const lang = who.get(me.address)?.lang ?? "en";
  const link = payLink(slug);
  const contribution = naira(fromUnits(v.contribution));
  const collector = nameOf(members[v.currentRound - 1]);
  return reply(tr(lang, "remindText", { names: waiting.map(nameOf).join(", "), amount: contribution, squad: row.name, collector, link }));
});

const reply = (message: string) => Response.json({ message, waLink: `https://wa.me/?text=${encodeURIComponent(message)}` });
