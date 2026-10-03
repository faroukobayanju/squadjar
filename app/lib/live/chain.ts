import { createPublicClient, http, type Address } from "viem";
import { monadTestnet } from "viem/chains";

export { monadTestnet };
export const FACTORY = (process.env.NEXT_PUBLIC_FACTORY ?? "0x") as Address;
export const TOKEN = (process.env.NEXT_PUBLIC_TOKEN ?? "0x") as Address;
export const hasPrivy = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
export const isLive = hasPrivy && !!process.env.NEXT_PUBLIC_FACTORY;

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz") });
