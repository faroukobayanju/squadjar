# Squadjar Contracts: Execution Plan

Companion to [2026-10-02-squadjar-contracts.md](2026-10-02-squadjar-contracts.md) (the "contracts plan"). Epic: faroukobayanju/squadjar#1, child issue #2.

The contracts plan is the single source of truth for **what** gets built: every contract, test, error, and deploy step. This document does not change any of it. It covers **how** the work is run: milestones, branches and PRs, the Windows/WSL environment, quality and security gates, and the handoff to the app. If the two documents ever disagree on contract behavior, the contracts plan wins.

- Owner of this work: @Haikeysgit (contracts)
- Reviewer and merger: @faroukobayanju
- Hackathon deadline: 2026-10-14 04:59 GMT+1. User test with a class squad: 2026-10-10.
- Target for contracts on testnet: 2026-10-06, so the app (Plan 2) can switch off demo data with days to spare.

## 1. Corrections to the contracts plan text

These are mechanical fixes found while reading the plan against the current machine and repo. None change contract behavior.

| Plan says | Do instead | Why |
|---|---|---|
| `cd /Users/zorak/Desktop/metropolis` (Task 1 Steps 1 and 7) | Run from the repo root (see section 3) | Author's local path |
| Accepted-review blocks say 57 tests | Expect **60 tests + 2 invariants** | Task steps are newer: Task 4 Step 5 expects 60 (5 token + 8 registry + 8 factory + 20 setup + 19 rounds) after the `firstDeadline` amendment |
| Task 6 Step 9 ends with `git push` to the current branch | Push the milestone branch and open a PR (section 4) | No direct pushes to `main` |
| Each task commits separately | Same, but commits are grouped into milestone PRs (section 2) | Clean, reviewable history |

Verified on Foundry 1.4.3 (2026-10-03): `forge init --no-deps` exists (alias of `--empty`), `--no-git` exists, and `forge install` no longer commits by default (`--commit` is opt-in). So Task 1 Step 1 works as written, apart from the path.

## 2. Milestones

One milestone = one branch = one PR. A milestone is done only when its exit check passes on a clean checkout of the branch.

| # | Branch | Contracts plan scope | Commits in PR | Exit check |
|---|---|---|---|---|
| M0 | `contracts/m0-execution-plan` | This document + `.gitattributes` | 1 | Owner agrees with the plan |
| M1 | `contracts/m1-token` | Task 1: Foundry scaffold, `foundry.toml`, `AjoNGN` | 1 | `forge test`: 5 pass |
| M2 | `contracts/m2-registry-factory` | Task 2: `ITrust`, `TrustRegistry`, `SquadFactory`, `Squad` Open phase, `Base.t.sol` | 1 | `forge test`: 30 pass (5 + 8 registry + 8 factory + 9 setup) |
| M3 | `contracts/m3-squad-lifecycle` | Tasks 3 and 4: start, turn order, deposits, contributions, settlement, refills, stopped paying, finish, `getState` | 2 (one per task) | `forge test`: 60 pass. Plan "Review Focus" items 1 to 7 each map to a passing test. `/cso` clean or findings resolved |
| M4 | `contracts/m4-invariants` | Task 5: balance conservation invariant | 1 | `forge test`: 60 pass + 2 invariants (256 runs x depth 60, `fail_on_revert = true`) |
| M5 | `contracts/m5-deploy` | Task 6: deploy script, local and Monad testnet deploy, smoke test, ABIs, contracts README | 1 | `deployments/10143.json` and 4 files in `abi/` committed. Smoke test passes (section 6). Security checklist done (section 5) |

M3 combines Tasks 3 and 4 because deposits and settlement only make sense reviewed together: the deposit formula exists to cover settlement's misses.

### Progress

- [ ] M0 execution plan
- [ ] M1 token
- [ ] M2 registry, factory, Open phase
- [ ] M3 squad lifecycle
- [ ] M4 invariants
- [ ] M5 testnet deploy and handoff

## 3. Environment (Windows + WSL)

- Foundry 1.4.3 lives in WSL (`~/.foundry/bin`). It is on `PATH` only in an interactive shell, so non-interactive calls use `wsl -e bash -ic "<command>"`.
- Repo path inside WSL: `/mnt/c/Users/user/Documents/squadjar`. All `forge`, `anvil`, and `cast` commands run from `contracts/` there.
- Git commits, pushes, and `gh` run from Windows, where GitHub auth lives. `forge install` runs in WSL and adds submodules through WSL git; that is fine.

### Line endings (fixed in M0)

Windows git has `core.autocrlf=true`, so the working tree is checked out with CRLF. WSL git has no such setting and reports every tracked file as modified. Worse, `contracts/script/export-abi.sh` would be checked out with CRLF and fail under bash.

Fix: a repo-wide `.gitattributes` with `* text=auto eol=lf`. The index already stores LF (the repo was authored on macOS), so this changes no file content in history and nothing for macOS users. After adding it, refresh the working tree once on Windows with `git checkout-index --force --all`, then confirm `git status` is clean from both Windows and WSL.

## 4. Git workflow

1. Start each milestone from the latest `main`: `git switch main && git pull && git switch -c contracts/mN-name`. If the previous milestone's PR is not merged yet, branch from that milestone's branch instead and rebase onto `main` once it merges.
2. Work uncommitted until the milestone's tests pass. No WIP, fixup, or "try again" commits.
3. Commit with the message given in the contracts plan's commit step (`feat(contracts): ...`, `test(contracts): ...`, `chore(contracts): ...`). This matches the repo's existing style (`feat(app):`, `docs:`).
4. Before pushing: run the milestone exit check, run the gates in section 5, and review `git diff main...HEAD --stat` for stray files (no `out/`, `cache/`, `broadcast/`, `.env`, or `node_modules/`).
5. Push the branch and open a PR to `main`:
   - Title: `contracts: M<N> <name>`
   - Body: what changed, the `forge test` summary line, any deviations from the contracts plan and why, and `Part of faroukobayanju/squadjar#1`.
6. @faroukobayanju reviews and merges. Use a merge commit or rebase-merge so the per-task commits in M3 survive. Avoid squash for M3.

## 5. Quality and security gates

| When | Gate | Purpose |
|---|---|---|
| Every milestone | Test-driven order from the contracts plan: write test, see it fail, write code, see it pass | Tests prove behavior, not just compile |
| Every milestone | Verification before completion: run the exit check fresh and read the output | No "should pass" claims |
| Every PR | Code review of the branch diff (`/review`) | Catch bugs before the owner sees them |
| After M3, before its PR | Security audit (`/cso`) of `Squad.sol`, `SquadFactory.sol`, `TrustRegistry.sol` | Money logic: reentrancy, access control, rounding, stuck funds |
| M5, before deploy | Secrets and key handling check (vibe-security) plus the checklist below | Keys and config |
| Any unclear test failure | Root-cause debugging before changing code | The contracts plan says: fix `Squad.sol`, not the test |

### Deploy security checklist (M5)

- [ ] `.gitignore` covers `.env*` (with `!.env.example`), `broadcast/`, `cache/`, `out/`. Already true at the repo root; add `contracts/deployments/31337.json` as Task 6 Step 3 says.
- [ ] Deployer is a new Foundry keystore (`cast wallet new ~/.foundry/keystores <name>`), used for Monad testnet only. Never reuse a key that has held real funds.
- [ ] The key lives only in the encrypted keystore; the deploy signs with `--account <name> --sender <address>` and prompts for the password. No raw private key in `.env`, chat, a PR, an issue, a commit, or on the command line.
- [ ] Before each push: `git diff main...HEAD` contains no 64-hex-character private key. The only allowed one is Anvil's public account #0 key in `Deploy.s.sol`, used solely when `chainid == 31337`.
- [ ] The registry owner is the deployer key (a single account). Accepted for testnet; a multisig owner is a TODOS item before any mainnet deploy.

## 6. Deploy day (M5)

- Fund the deployer early from the Monad testnet faucet (linked from docs.monad.xyz). Faucets are rate-limited.
- Monad charges gas on the gas limit, not gas used. Don't pad gas limits by hand.
- Deploy locally to Anvil first (Task 6 Step 3), then to testnet (Step 5).
- Smoke test (Step 6) must show: `timing(0)` returns `300 60 300`; `isWriter(factory)` is `true`; two consecutive blocks have **different** `mixHash` values. If they are equal or zero, add "turn-order randomness: prevrandao constant on Monad testnet" to `TODOS.md` in the same PR. This does not block the demo.
- If Sourcify verification fails, the deployment still stands. Rerun only verification as Step 5 describes.

## 7. Handoff to the app (Plan 2)

M5 delivers, all under `contracts/`:

| Deliverable | Used by the app for |
|---|---|
| `deployments/10143.json` (`chainId`, `token`, `registry`, `factory`, `deployBlock`) | Contract addresses; `deployBlock` is where event scans start |
| `abi/AjoNGN.json`, `abi/TrustRegistry.json`, `abi/SquadFactory.json`, `abi/Squad.json` | viem reads and writes |
| `README.md`: lifecycle, invite-hash recipe, enum ordinals, error catalogue | Mapping contract errors to user-facing copy |
| Local Anvil path (`deployments/31337.json`, gitignored) | App development and E2E tests without testnet waits |

After the M5 merge, comment on faroukobayanju/squadjar#1 with the addresses and the README link.

Any contract change after M5: fix, re-run the full suite and invariants, redeploy the factory (and token or registry only if they changed), allowlist the new factory with `registry.setWriter(newFactory, true)`, re-export ABIs, and update `deployments/10143.json`. Keep the old factory's address so the app can still read its squads. Revoking the old factory is safe for money at any time: its squads keep paying, settling and finishing. From then on, though, its squads record no trust at all (on-time payments, misses and stopping all go unrecorded) until it is re-allowed (see `contracts/README.md`, Replacing a factory). Trust history survives because the registry stays.

## 8. Out of scope for this work

Each item is already tracked in `TODOS.md` or the contracts plan's review record. Listed here so nobody assumes it was forgotten.

| Item | Status |
|---|---|
| Commit-reveal turn order | Deferred. Replaced by the deploy-day `prevrandao` check |
| Organizer-signed invites | Deferred. Organizer `remove()` mitigates squatting |
| Fairness invariants (`finalizeDeposits`, `cancel`) | Deferred, P2 |
| Social vouching / uncollateralized turns | Deferred, 12-month story |
| Multisig registry owner | Before any mainnet deploy |
| Trust farming across self-run squads | Before any real-money launch, P1 mainnet |
| Calendar-month deadlines | Deferred; Monthly is a fixed 30 days |
| Demo seed script | Plan 2 owns it |
| App integration (`app/lib/chain.ts`, settlement cron, relayer) | Plan 2 |
