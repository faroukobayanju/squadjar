# End-to-end contract checks

`scripts/e2e/run.sh` forks Monad testnet on anvil (port 8547), runs `run.mjs` against the real deployed factory, registry and token from `contracts/deployments/10143.json`, then stops anvil. Takes about 2 minutes and exits 1 if any check fails.

Needs Foundry (`~/.foundry/bin`) and `npm install` in `app/` (viem is loaded from `app/node_modules`; set `VIEM_DIR` to point elsewhere). No keys or MON: members are made-up addresses impersonated on anvil, funded with `anvil_setBalance` and `faucet()`. Time moves with `evm_setNextBlockTimestamp`.

Scenarios (expected numbers are worked out from `Squad.sol` in comments next to each one):

1. Happy path, Demo, 3 members, c = ₦2,000.
2. One miss: the round 1 collector skips round 2.
3. Stopped paying: (a) after collecting, (b) before their turn, so the jar fronts.
4. Never locks deposit: (a) 4 to 3 members, the squad continues; (b) 3 to 2, the squad is cancelled.
5. Organizer cancels during deposits.
6. Late settle: the next deadline rolls forward and `RoundNotOpen` holds until it opens.
7. Trust score in a Weekly squad of 5 at ₦1,000, and Demo squads write no trust.
8. `firstDeadline` keeps its weekday and time after a late activation.

Against an anvil you already started: `RPC_URL=http://127.0.0.1:8547 node scripts/e2e/run.mjs`.

`scripts/e2e/judge.sh` plays a judge through a demo squad with the bot planner (`app/lib/judge-plan.ts`): Ada creates, Tunde joins, the judge joins, locks and pays, the squad completes and a fresh demo squad opens. One loop = one `/api/cron/judge` run, 60 seconds apart.
