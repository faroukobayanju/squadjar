"use client";

import { useCallback, useState } from "react";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, maxUint256, type Abi, type Address, type TransactionReceipt } from "viem";
import { monadTestnet, publicClient, TOKEN } from "./chain";
import { tokenAbi } from "./abi";

export type Call = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };
type Opts = { approve?: { spender: Address; amount: bigint } };

export function useWrite() {
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const [busy, setBusy] = useState(false);

  const write = useCallback(
    async (call: Call, opts?: Opts): Promise<TransactionReceipt> => {
      const wallet = wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];
      if (!wallet) throw new Error("No account ready");
      const account = wallet.address as Address;

      async function send(c: Call): Promise<TransactionReceipt> {
        // Simulate first so contract errors surface decoded (ContractFunctionRevertedError.data.errorName).
        await publicClient.simulateContract({ ...c, account } as never);
        const data = encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args } as never);
        const attempt = () => sendTransaction({ to: c.address, data, chainId: monadTestnet.id }, { address: account, sponsor: true });
        let hash: `0x${string}`;
        try {
          ({ hash } = await attempt());
        } catch {
          ({ hash } = await attempt()); // one retry for network errors
        }
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "reverted") throw new Error("Transaction reverted");
        return receipt;
      }

      setBusy(true);
      try {
        if (opts?.approve) {
          const { spender, amount } = opts.approve;
          const allowance = await publicClient.readContract({ address: TOKEN, abi: tokenAbi, functionName: "allowance", args: [account, spender] });
          if (allowance < amount) await send({ address: TOKEN, abi: tokenAbi as Abi, functionName: "approve", args: [spender, maxUint256] });
        }
        return await send(call);
      } finally {
        setBusy(false);
      }
    },
    [sendTransaction, wallets],
  );

  return { write, busy };
}
