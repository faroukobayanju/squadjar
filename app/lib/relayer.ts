import { createWalletClient, http, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RPC, monadTestnet, publicClient } from "./live/chain";
import { squadAbi } from "./live/abi";
import { plan } from "./poke-plan";
import { indexTx } from "./activity";

/**
 * The one place the relayer's signing key lives. Swap for a policy-scoped Privy server wallet here
 * (see docs/privy-notes.md, "Relayer upgrade"); nothing else touches the key.
 */
function relayerAccount() {
  const k = process.env.RELAYER_PRIVATE_KEY;
  return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? privateKeyToAccount(k as Hex) : null;
}
export const relayerConfigured = () => relayerAccount() !== null;

// One send at a time per instance so concurrent pokes can't reuse a nonce.
// ponytail: per-instance only; multiple instances need a per-key lock or a nonce manager.
let chain: Promise<unknown> = Promise.resolve();
const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

export type PokeResult = "settled" | "nothing";

/** Settles an overdue round. Never sends a write whose simulation reverted. */
export async function poke(squad: Address): Promise<PokeResult> {
  const account = relayerAccount();
  if (!account || !isAddress(squad)) throw new Error("relayer not configured");
  const v = await publicClient.readContract({ address: squad, abi: squadAbi, functionName: "getState" });
  if (!plan(v, (await publicClient.getBlock()).timestamp)) return "nothing";
  const call = { address: squad, abi: squadAbi, functionName: "settleRound", args: [v.currentRound], account } as const;
  let request: object;
  let gas: bigint;
  try {
    request = (await publicClient.simulateContract(call as never)).request as object;
    gas = ((await publicClient.estimateContractGas(call as never)) * BigInt(12)) / BigInt(10); // Monad charges the gas limit
  } catch {
    return "nothing"; // simulation reverted (someone else got there first, or not yet due on-chain): nothing was sent
  }
  // Send errors, reverted receipts and RPC failures throw: the caller must not report them as done.
  const ok = await serialized(async () => {
    const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC) });
    const hash = await wallet.writeContract({ ...request, gas } as never);
    const ok = (await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 })).status === "success";
    if (ok) await indexTx(hash).catch(() => {});
    return ok;
  });
  if (!ok) throw new Error("transaction reverted");
  return "settled";
}
