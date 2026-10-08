# End-to-end contract checks

`scripts/e2e/run.sh` forks Monad testnet on anvil (port 8547), runs `run.mjs` against the real deployed factory, registry and token from `contracts/deployments/10143.json`, then stops anvil. Takes about 2 minutes and exits 1 if any check fails.

Needs Foundry (`~/.foundry/bin`) and `npm install` in `app/` (viem is loaded from `app/node_modules`; set `VIEM_DIR` to point elsewhere). No keys or MON: members are made-up addresses impersonated on anvil, funded with `anvil_setBalance` and `faucet()`. Time moves with `evm_setNextBlockTimestamp`.

Scenarios (expected numbers are worked out from `Squad.sol` in comments next to each one). Every member is New, so a collector holds back everything they still owe; every completed squad must leave each member level and the jar at ₦0:

1. Happy path, Demo, 3 members, c = ₦2,000: `start()` goes straight to round 1, payouts of c, 2c, 3c now with 2c and c held, held money back at the end.
2. Round 1 miss: the miss becomes debt (`owed`) and credit for the short-paid collector; `payBack()` sends it straight to them.
3. The collector misses their own round: a smaller payout, no debt.
4. Held money covers the collector's later misses, so the next collectors are paid in full.
5. Debt taken from the misser's own payout (`CreditPaid` inside the settle).
6. Organizer cancels while Open; cancel and start guards.
7. Late settle: the next deadline rolls forward, `RoundNotOpen` holds until it opens, and the late member's miss is debt.
8. Trust score in a Weekly squad of 5 at ₦1,000, and Demo squads write no trust.
9. `firstDeadline` keeps its weekday and time after a late `start()` (a and b).
10. Pay back guards: `NotMember`, `NothingOwed`, missing allowance keeps the debt, `PastGrace`.

There is no "stopped paying" any more: the contract has no such state.

Against an anvil you already started: `RPC_URL=http://127.0.0.1:8547 node scripts/e2e/run.mjs`.

`scripts/e2e/judge.sh` plays a judge through a demo squad with the bot planner (`app/lib/judge-plan.ts`): Ada creates, Tunde joins, the judge joins, Ada starts (straight to round 1), everyone pays, the squad completes with no debt and an empty jar, and a fresh demo squad opens. Bots pay back first if they ever owe. One loop = one `/api/cron/judge` run, 60 seconds apart.
