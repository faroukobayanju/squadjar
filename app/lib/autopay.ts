import { encodeFunctionData, type Address, type Hex } from "viem";
import { configured, privy } from "./auth-server";
import { sql } from "./db";
import { monadTestnet, publicClient, TOKEN } from "./live/chain";
import { squadAbi, tokenAbi } from "./live/abi";
import { dueMembers } from "./autopay-plan";
import { indexTx } from "./activity";

// Squadjar is a signer on the member's account, limited by the auto-pay policy (only contribute(), value 0, chain 10143).
// See docs/privy-notes.md, "Auto-pay setup".
const KEY = process.env.PRIVY_AUTH_PRIVATE_KEY;
const SIGNER = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;
const POLICY = process.env.NEXT_PUBLIC_PRIVY_AUTOPAY_POLICY_ID;
export const autopayConfigured = () => configured && !!KEY && !!SIGNER && !!POLICY;

const CONTRIBUTE = encodeFunctionData({ abi: squadAbi, functionName: "contribute" }); // 0xd7bb99ba

/** The member's Privy account id, only when our signer is on it with the auto-pay policy. Fails closed. */
async function signerWallet(member: Address): Promise<string | null> {
  const page = await privy().wallets().list({ address: member, chain_type: "ethereum" });
  const w = page.data.find((x) => x.address.toLowerCase() === member.toLowerCase());
  const ok = w?.additional_signers?.some((s) => s.signer_id === SIGNER && (s.override_policy_ids ?? []).includes(POLICY!));
  return ok ? w!.id : null;
}

/** True when the member's account has our signer attached (used by the toggle to skip re-adding it). */
export const hasSigner = (member: Address) => signerWallet(member).then(Boolean);

type Outcome = "paid" | "low" | "skip" | "failed";

/** Pays one member's contribution. Never sends after a reverted simulation. */
async function payFor(squad: Address, member: Address, contribution: bigint): Promise<Outcome> {
  const balance = await publicClient.readContract({ address: TOKEN, abi: tokenAbi, functionName: "balanceOf", args: [member] });
  if (balance < contribution) return "low";
  try {
    await publicClient.simulateContract({ address: squad, abi: squadAbi, functionName: "contribute", account: member });
  } catch {
    return "skip"; // e.g. RoundNotOpen, PastGrace, missing allowance: nothing sent
  }
  const walletId = await signerWallet(member);
  if (!walletId) {
    console.error("autopay: signer/policy not found for member", { squad, member });
    return "failed";
  }
  const { hash } = await privy()
    .wallets()
    .ethereum()
    .sendTransaction(walletId, {
      caip2: `eip155:${monadTestnet.id}`,
      sponsor: true,
      params: { transaction: { to: squad, data: CONTRIBUTE, value: "0x0", chain_id: monadTestnet.id } },
      authorization_context: { authorization_private_keys: [KEY!] },
    });
  if (!hash) return "failed";
  const r = await publicClient.waitForTransactionReceipt({ hash: hash as Hex, timeout: 30_000 });
  if (r.status === "success") await indexTx(hash as Hex).catch(() => {});
  return r.status === "success" ? "paid" : "failed";
}

// One run at a time per instance, and inside a run one send at a time, waiting for each receipt,
// so a member is never sent two contribute() calls in flight.
// ponytail: per-instance lock; a second instance can race, the contract's AlreadyPaid revert caps the damage at one wasted sponsored send.
let running: Promise<unknown> = Promise.resolve();

export function runAutopay(): Promise<{ paid: number; skippedLowBalance: number; failed: number }> {
  const run = running.then(async () => {
    const out = { paid: 0, skippedLowBalance: 0, failed: 0 };
    const rows = (await sql`select squad, array_agg(member) as members from autopay where enabled group by squad`) as { squad: Address; members: string[] }[];
    const now = (await publicClient.getBlock()).timestamp;
    // ponytail: sequential walk of opted-in squads; fine at hundreds, batch reads past ~1k.
    for (const { squad, members } of rows) {
      try {
        const v = await publicClient.readContract({ address: squad, abi: squadAbi, functionName: "getState" });
        for (const m of dueMembers(v, members, now)) {
          const o = await payFor(squad, m as Address, v.contribution).catch((e): Outcome => {
            console.error("autopay: member failed", { squad, member: m }, e);
            return "failed";
          }); // one member failing must not stop the rest
          if (o === "paid") out.paid++;
          else if (o === "low") out.skippedLowBalance++;
          else if (o === "failed") out.failed++;
        }
      } catch (e) {
        console.error("autopay: squad failed", { squad }, e);
        out.failed++; // squad read failed
      }
    }
    return out;
  });
  running = run.catch(() => {});
  return run;
}
