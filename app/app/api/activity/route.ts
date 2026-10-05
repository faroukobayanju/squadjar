import type { Hex } from "viem";
import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { indexTx } from "@/lib/activity";

/** Public: always re-reads the receipt from the chain, and the insert is idempotent. */
export const POST = route(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as { tx?: unknown } | null;
  if (typeof body?.tx !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.tx)) return bad();
  return Response.json({ indexed: await indexTx(body.tx as Hex) });
});

export const GET = route(async (req: Request) => {
  const me = await requireUser(req);
  const rows = await sql`
    select a.tx, a.log_index as "logIndex", a.kind, a.amount::float8 as amount, a.round, a.at, s.name as "squadName", s.slug
    from activity a left join squads s on s.address = a.squad
    where a.member = ${me.address}
    order by a.at desc, a.log_index desc
    limit 100`;
  return Response.json(rows);
});
