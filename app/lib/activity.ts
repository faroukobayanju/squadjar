import type { Hex, PublicClient, TransactionReceipt } from "viem";
import { sql } from "./db";
import { FACTORY, TOKEN, publicClient } from "./live/chain";
import { LEGACY_FACTORY, insertRows, rowsFor } from "./activity-classify";

/** Indexes one transaction's sNGN movements from the chain (never from the caller). Returns how many rows were new. */
export async function indexTx(hash: Hex): Promise<number> {
  let receipt: TransactionReceipt | undefined;
  for (let i = 0; !receipt; i++) {
    receipt = await publicClient.getTransactionReceipt({ hash }).catch((e) => {
      if (i >= 4) throw e; // not found yet (or RPC trouble): retry for ~4s
      return undefined;
    });
    if (!receipt) await new Promise((ok) => setTimeout(ok, 1000));
  }
  if (receipt.status !== "success") return 0;
  return insertRows(sql, await rowsFor(publicClient as PublicClient, receipt, [FACTORY, LEGACY_FACTORY], TOKEN));
}
