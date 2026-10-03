import { createPublicClient, formatUnits, http, parseUnits, type Address } from "viem";
import { monadTestnet } from "viem/chains";
import { tokenAbi } from "./abi";

export { monadTestnet };
export const FACTORY = (process.env.NEXT_PUBLIC_FACTORY ?? "0x") as Address;
export const TOKEN = (process.env.NEXT_PUBLIC_TOKEN ?? "0x") as Address;
export const hasPrivy = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
export const isLive = hasPrivy && !!process.env.NEXT_PUBLIC_FACTORY;

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz") });

/** Whole naira (UI) <-> sNGN base units (18 decimals). Conversions live only here. */
export const toUnits = (naira: number): bigint => parseUnits(String(naira), 18);
export const fromUnits = (x: bigint): number => Number(formatUnits(x, 18));
export const readBalance = (who: Address): Promise<number> =>
  publicClient.readContract({ address: TOKEN, abi: tokenAbi, functionName: "balanceOf", args: [who] }).then(fromUnits);
