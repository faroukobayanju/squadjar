// Pure, so `node lib/clock.check.ts` runs it directly.
/** Chain time minus the local clock, in ms: add it to Date.now() to get the chain's now. */
export const clockOffset = (blockTimestampSec: number | bigint, localMs: number) => Number(blockTimestampSec) * 1000 - localMs;
