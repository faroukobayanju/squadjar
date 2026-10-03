import { createWalletClient, http, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet, publicClient } from "./live/chain";
import { squadAbi } from "./live/abi";
import { plan } from "./poke-plan";

/**
 * The one place the relayer's signing key lives. Swap for a policy-scoped Privy server wallet here
 * (see docs/privy-notes.md, "Relayer upgrade"); nothing else touches the key.
 */
function relayerAccount() {
  const k = process.env.RELAYER_PRIVATE_KEY;
  return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? privateKeyToAccount(k as Hex) : null;
}
export const relayerConfigured = () => relayerAccount() !== null;

export type PokeResult = "settled" | "finalized" | "nothing";

/** Settles an overdue round or finalizes expired deposits. Never sends a write whose simulation reverted. */
export async function poke(squad: Address): Promise<PokeResult> {
  const account = relayerAccount();
  if (!account || !isAddress(squad)) throw new Error("relayer not configured");
  const v = await publicClient.readContract({ address: squad, abi: squadAbi, functionName: "getState" });
  const what = plan(v, BigInt(Math.floor(Date.now() / 1000)));
  if (!what) return "nothing";
  try {
    const call =
      what === "settle"
        ? ({ address: squad, abi: squadAbi, functionName: "settleRound", args: [v.currentRound], account } as const)
        : ({ address: squad, abi: squadAbi, functionName: "finalizeDeposits", account } as const);
    const { request } = await publicClient.simulateContract(call as never);
    const gas = ((await publicClient.estimateContractGas(call as never)) * BigInt(12)) / BigInt(10); // Monad charges the gas limit
    const wallet = createWalletClient({ account, chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz") });
    const hash = await wallet.writeContract({ ...(request as object), gas } as never);
    await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    return what === "settle" ? "settled" : "finalized";
  } catch {
    return "nothing"; // simulation reverted (someone else got there first, or not yet due on-chain): nothing was sent
  }
}
