import type { Address } from "viem";
import { sql } from "./db";
import { FACTORY, publicClient } from "./live/chain";
import { factoryAbi, registryAbi } from "./live/abi";
import type { PayRecord } from "./record-line";

/** Server: each address's payment record, keyed by lowercase address, in one multicall and one query. */
export async function recordsOf(who: readonly Address[]): Promise<Record<string, PayRecord>> {
  const addrs = [...new Set(who.map((a) => a.toLowerCase() as Address))];
  if (!addrs.length) return {};
  const reg = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "registry" });
  const [res, stopped] = await Promise.all([
    publicClient.multicall({
      allowFailure: false,
      contracts: addrs.flatMap((a) => [
        { address: reg, abi: registryAbi, functionName: "records", args: [a] } as const,
        { address: reg, abi: registryAbi, functionName: "tier", args: [a] } as const,
      ]),
    }),
    sql`select member, count(distinct squad)::int as n from activity where kind = 'stopped' and member = any(${addrs}) group by member`,
  ]);
  const n = new Map(stopped.map((r) => [r.member as string, r.n as number]));
  return Object.fromEntries(
    addrs.map((a, i) => {
      const [onTime, late, missed, completed] = res[2 * i] as readonly [number, number, number, number];
      return [a, { onTime, late, missed, completed, tier: res[2 * i + 1] as number, stoppedSquads: n.get(a) ?? 0 }];
    }),
  );
}

export const recordOf = async (a: Address): Promise<PayRecord> => (await recordsOf([a]))[a.toLowerCase()];
