import { type Address } from "viem";
import { route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { fromUnits, publicClient } from "@/lib/live/chain";
import { squadAbi } from "@/lib/live/abi";
import { periodOf } from "@/lib/chain-map";

// Open public squads, newest first. Public (no sign-in): it only lists what anyone could find.
export const GET = route(async () => {
  const rows = await sql`select address, slug, name, description, min_tier, approval from squads where visibility = 'public' order by created_at desc limit 50`;
  // ponytail: one getState per candidate per request, and started squads still use up the 50; add a state column (or a cache) when public squads pass ~50.
  const views = await Promise.all(
    rows.map((r) => publicClient.readContract({ address: r.address as Address, abi: squadAbi, functionName: "getState" }).catch(() => null)),
  );
  return Response.json(
    rows.flatMap((r, i) => {
      const v = views[i];
      if (!v || v.state !== 0) return []; // 0 = Open
      return [
        {
          slug: r.slug,
          name: r.name,
          description: r.description,
          minTier: r.min_tier,
          approval: r.approval,
          contribution: fromUnits(v.contribution),
          period: periodOf(v.roundLength),
          members: v.members.length,
          maxMembers: v.maxMembers,
        },
      ];
    }),
  );
});
