"use client";

// Syncs the countdown clock to the chain's block time, which is what the contract's deadlines use.
import { setClockOffset } from "@/components/countdown";
import { clockOffset } from "../clock";
import { isLive, publicClient } from "./chain";

const SYNC_MS = 5 * 60_000;
let started = false;

async function sync() {
  try {
    const t0 = Date.now();
    const block = await publicClient.getBlock();
    setClockOffset(clockOffset(block.timestamp, t0));
  } catch {
    // keep the last offset
  }
}

/** Idempotent; live mode only (demo keeps offset 0). Reads the latest block now and every 5 minutes. */
export function startChainClock() {
  if (started || !isLive || typeof window === "undefined") return;
  started = true;
  sync();
  setInterval(sync, SYNC_MS);
}
