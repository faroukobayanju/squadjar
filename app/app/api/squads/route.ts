import { encodeAbiParameters, isAddress, keccak256, type Address, type Hex } from "viem";
import { bad, requireUser, route } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { FACTORY, publicClient } from "@/lib/live/chain";
import { factoryAbi, squadAbi } from "@/lib/live/abi";
import { slugify } from "@/lib/slug";

export const GET = route(async (req: Request) => {
  const a = (new URL(req.url).searchParams.get("a") ?? "").split(",").filter(Boolean).map((x) => x.toLowerCase());
  if (a.length > 100 || !a.every((x) => isAddress(x))) return bad("bad addresses");
  const rows = await sql`select address, slug, name from squads where address = any(${a})`;
  return Response.json(Object.fromEntries(rows.map((r) => [r.address, { slug: r.slug, name: r.name }])));
});

export const POST = route(async (req: Request) => {
  const me = await requireUser(req);
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const { address, inviteCode } = body ?? {};
  if (typeof address !== "string" || !isAddress(address)) return bad("bad address");
  if (name.length < 1 || name.length > 40) return bad("name must be 1 to 40 characters");
  if (typeof inviteCode !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(inviteCode)) return bad("bad invite code");

  const squad = address as Address;
  const [isSquad, organizer, inviteHash] = await Promise.all([
    publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "isSquad", args: [squad] }),
    publicClient.readContract({ address: squad, abi: squadAbi, functionName: "organizer" }).catch(() => null),
    publicClient.readContract({ address: squad, abi: squadAbi, functionName: "inviteHash" }).catch(() => null),
  ]);
  if (!isSquad || organizer?.toLowerCase() !== me.address) return bad("forbidden", 403);
  if (inviteHash !== keccak256(encodeAbiParameters([{ type: "bytes32" }], [inviteCode as Hex]))) return bad("invite code does not match", 400);

  const addr = squad.toLowerCase();
  const existing = await sql`select slug from squads where address = ${addr}`;
  if (existing[0]) return Response.json({ slug: existing[0].slug });
  const slug = await slugify(name, async (s) => (await sql`select 1 from squads where slug = ${s}`).length > 0);
  await sql`insert into squads (address, slug, name, invite_code, organizer) values (${addr}, ${slug}, ${name}, ${inviteCode}, ${me.address})`;
  return Response.json({ slug });
});
