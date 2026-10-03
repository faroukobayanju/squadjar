import { isAddress, type Address } from "viem";
import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { publicClient } from "@/lib/live/chain";
import { squadAbi } from "@/lib/live/abi";
import { autopayConfigured, hasSigner } from "@/lib/autopay";

const off = () => bad("auto-pay not configured", 503);

/** GET ?squad= → { enabled, signer }: this member's choice for the squad, and whether our signer is on their account. */
export const GET = route(async (req: Request) => {
  if (!autopayConfigured()) return off();
  const me = await requireUser(req);
  const squad = new URL(req.url).searchParams.get("squad");
  if (!squad || !isAddress(squad)) return bad();
  const rows = await sql`select enabled from autopay where member = ${me.address} and squad = ${squad.toLowerCase()}`;
  return Response.json({ enabled: !!rows[0]?.enabled, signer: await hasSigner(me.address) });
});

/** POST { squad, enabled } for one squad (caller must be a member), or { all: true, enabled: false } to stop everywhere. */
export const POST = route(async (req: Request) => {
  if (!autopayConfigured()) return off();
  const me = await requireUser(req);
  const body = (await req.json().catch(() => null)) as { squad?: unknown; enabled?: unknown; all?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return bad();
  if (body.all === true) {
    if (body.enabled) return bad();
    await sql`update autopay set enabled = false, updated_at = now() where member = ${me.address}`;
    return Response.json({ ok: true });
  }
  if (typeof body.squad !== "string" || !isAddress(body.squad)) return bad();
  const squad = body.squad.toLowerCase() as Address;
  if (!(await sql`select 1 from squads where address = ${squad}`).length) return bad("not found", 404);
  const member = await publicClient.readContract({ address: squad, abi: squadAbi, functionName: "isMember", args: [me.address] });
  if (!member) return bad("forbidden", 403);
  await sql`insert into autopay (member, squad, enabled) values (${me.address}, ${squad}, ${body.enabled})
    on conflict (member, squad) do update set enabled = excluded.enabled, updated_at = now()`;
  return Response.json({ ok: true });
});
