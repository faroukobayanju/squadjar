"use client";

import { useCallback, useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, maxUint256, type Abi, type Address, type ContractFunctionArgs, type ContractFunctionName, type TransactionReceipt } from "viem";
import { hasPrivy, monadTestnet, publicClient, TOKEN } from "./chain";
import { tokenAbi } from "./abi";

type Call<A extends Abi = Abi, F extends string = string> = { address: Address; abi: A; functionName: F; args?: readonly unknown[] };
export type WriteCall<A extends Abi, F extends ContractFunctionName<A, "nonpayable" | "payable">> = {
  address: Address;
  abi: A;
  functionName: F;
  args?: ContractFunctionArgs<A, "nonpayable" | "payable", F>;
};
type Opts = { approve?: { spender: Address; amount: bigint } };
type Write = <const A extends Abi, F extends ContractFunctionName<A, "nonpayable" | "payable">>(call: WriteCall<A, F>, opts?: Opts) => Promise<TransactionReceipt>;

// Network/RPC trouble only. Never user rejection, contract reverts, or sponsorship/policy rejection.
function transient(e: unknown): boolean {
  for (let x = e as { name?: string; message?: string; cause?: unknown } | undefined, i = 0; x && i < 8; i++) {
    if (/reject|denied|policy|sponsor|revert/i.test(`${x.name} ${x.message}`)) return false;
    x = x.cause as typeof x;
  }
  for (let x = e as { name?: string; message?: string; cause?: unknown } | undefined, i = 0; x && i < 8; i++) {
    if (/HttpRequestError|TimeoutError|WebSocketRequestError|failed to fetch|network|timed? ?out|ECONN|fetch failed/i.test(`${x.name} ${x.message}`)) return true;
    x = x.cause as typeof x;
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!transient(e)) throw e;
    return fn();
  }
}

function usePrivyWrite() {
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const [busy, setBusy] = useState(false);

  const write = useCallback<Write>(
    async (call, opts) => {
      const wallet = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];
      if (!wallet) throw new Error("No account ready");
      const account = wallet.address as Address;

      async function send(c: Call): Promise<TransactionReceipt> {
        // Simulate first so contract errors surface decoded (ContractFunctionRevertedError.data.errorName).
        await withRetry(() => publicClient.simulateContract({ ...c, account }));
        // Explicit 1.5x gas margin: start() sorts turns with prevrandao, so the block it lands in can cost up to ~5% more
        // than the estimate (seen in scripts/e2e). Sponsored, so the margin costs the user nothing.
        const est = await withRetry(() => publicClient.estimateContractGas({ ...c, account } as Parameters<typeof publicClient.estimateContractGas>[0]));
        const gasLimit = (est * BigInt(3)) / BigInt(2);
        const data = encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args });
        const { hash } = await withRetry(() => sendTransaction({ to: c.address, data, chainId: monadTestnet.id, gasLimit }, { address: account, sponsor: true }));
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "reverted") throw new Error("Transaction reverted");
        // Money history: the server re-reads this receipt itself. Never blocks or throws.
        fetch("/api/activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx: receipt.transactionHash }) }).catch(() => {});
        return receipt;
      }

      setBusy(true);
      try {
        if (opts?.approve) {
          const { spender, amount } = opts.approve;
          const allowance = await withRetry(() => publicClient.readContract({ address: TOKEN, abi: tokenAbi, functionName: "allowance", args: [account, spender] }));
          if (allowance < amount) await send({ address: TOKEN, abi: tokenAbi, functionName: "approve", args: [spender, maxUint256] });
        }
        return await send(call as Call); // generic boundary: the public signature carries the typing
      } finally {
        setBusy(false);
      }
    },
    [sendTransaction, wallets],
  );

  return { write, busy };
}

const stub = (): { write: Write; busy: boolean } => ({
  write: async () => {
    throw new Error("Writes need sign-in");
  },
  busy: false,
});

// hasPrivy is a build-time constant, so the hook order never changes; demo mode never touches Privy hooks.
export const useWrite: () => { write: Write; busy: boolean } = hasPrivy ? usePrivyWrite : stub;
