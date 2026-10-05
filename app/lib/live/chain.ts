import { createPublicClient, formatUnits, http, parseUnits, type Address } from "viem";
import { monadTestnet } from "viem/chains";
import { factoryAbi, registryAbi, tokenAbi } from "./abi";

export { monadTestnet };
export const FACTORY = (process.env.NEXT_PUBLIC_FACTORY ?? "0x") as Address;
export const TOKEN = (process.env.NEXT_PUBLIC_TOKEN ?? "0x") as Address;
export const hasPrivy = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
export const isLive = hasPrivy && !!process.env.NEXT_PUBLIC_FACTORY && !!process.env.NEXT_PUBLIC_TOKEN;

export const RPC = "https://testnet-rpc.monad.xyz";
export const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC) });

/** Whole naira (UI) <-> sNGN base units (18 decimals). Conversions live only here. */
export const toUnits = (naira: number): bigint => parseUnits(String(naira), 18);
export const fromUnits = (x: bigint): number => Number(formatUnits(x, 18));
export const readBalance = (who: Address): Promise<number> =>
  publicClient.readContract({ address: TOKEN, abi: tokenAbi, functionName: "balanceOf", args: [who] }).then(fromUnits);

/** Registry tiers (0 New, 1 Building, 2 Reliable), in the order given. */
export async function readTiers(who: readonly Address[]): Promise<number[]> {
  if (!who.length) return [];
  const reg = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "registry" });
  return publicClient.multicall({ allowFailure: false, contracts: who.map((a) => ({ address: reg, abi: registryAbi, functionName: "tier", args: [a] }) as const) });
}
