# Registry Revoke Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revoking a factory in `TrustRegistry` must never freeze a squad's money; then redeploy the registry and factory on Monad testnet while keeping the existing sNGN token.

**Architecture:** `TrustRegistry`'s three `record*` functions ignore calls from addresses that are not live squads instead of reverting, so `Squad` (unchanged) keeps paying, settling and finishing whatever the registry owner does. The deploy script gains an optional `TOKEN` to reuse the deployed `AjoNGN`, so only the registry and factory get new addresses.

**Tech Stack:** Solidity 0.8.24, Foundry 1.4.3 (runs in WSL), OpenZeppelin v5.1.0, Monad testnet (chain 10143).

**Spec:** faroukobayanju/squadjar#9, "Important" item 1, plus the design approved in chat on 2026-10-05 (summarised below). Contracts spec: `docs/superpowers/specs/2026-10-02-squadjar-design.md`. Contracts README: `contracts/README.md`.

### Approved design (2026-10-05)

1. In `TrustRegistry.recordContribution`, `recordMiss` and `recordCompleted`: `if (!isSquad(msg.sender)) return;` instead of reverting. `registerSquad` keeps reverting `NotWriter()`. No try/catch in `Squad`: a caller could pass just enough gas to make an inner call fail and silently skip trust records.
2. Tests: the two "cannot write" registry tests become "write is ignored, nothing recorded"; a trust-counting Weekly squad finishes after its factory is revoked; gap tests from #9 (trust gate at ₦999 vs ₦1,000 and 4 vs 5 members, round 1 not open before `firstDeadline - roundLength`, the dropped-organizer squad played to Completed).
3. Deploy script reuses an existing token when `TOKEN` is set. The app's ABIs do not change.
4. Docs: README "Replacing a factory" no longer warns about a pause; TODOS entry removed; execution plan runbook updated; spec line 111 dust recipient corrected; `deployments/10143.json` and the README deployment table updated after the redeploy.
5. Out of scope (stays in #9): trust farming, a miss with no free jar money not pushing a member toward stopped, the invariant's deposit phase and donation handler, the dead `!isMember[organizer]` check in `cancel`.

## Global Constraints

- Foundry runs only in WSL: `wsl -e bash -ic "cd /mnt/c/Users/user/Documents/squadjar/contracts && forge test"`. Git runs from Windows in `C:\Users\user\Documents\squadjar`.
- Branch `contracts/registry-revoke-fix`. One PR for the whole plan; faroukobayanju reviews. Do not push or open the PR inside a task.
- Commit messages in plain professional English (conventional-commit subject), ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use `git commit -F <tempfile>`.
- Never stage anything under `.claude/`, `.superpowers/`, `contracts/out/`, `contracts/cache/`, `contracts/broadcast/`, or `contracts/deployments/31337.json`.
- `_finish` must never revert. Demo squads never write trust (`countsForTrust` needs `n >= 5`, `c >= 1000e18`, Weekly or Monthly).
- Do not change `Squad.sol`, `SquadFactory.sol`, `AjoNGN.sol`, or any public/external signature, event or error. Keep `TrustRegistry.NotSquad` declared even though nothing throws it now: `app/lib/live/abi.ts` (a shared file) lists it, so removing it would need a heads-up to faroukobayanju.
- Glossary terms from `CONTEXT.md` in names and comments.
- Full suite must stay green: today 67 tests + 2 invariants (1,000 runs each), no compiler warnings.

## Quality and Security Gates

- Every task: spec + quality review of its diff before the next task starts (subagent-driven development).
- After Task 1: security audit of the `TrustRegistry` change and its effect on `Squad` (gstack `/cso`, done by hand for Solidity as in the M3 audit): no path where a write is skipped that should count, no new revert path in `contribute`, `settleRound` or `_finish`, no way to fake being a squad.
- After Task 3, before Task 4: secrets and key check (vibe-security): no private key, mnemonic or `.env` in the branch diff (Anvil's public key in `Deploy.s.sol` is the only allowed 64-hex string), deploy still fails closed without `--account` / `--sender`, `TOKEN` misuse fails closed.
- Before the PR: whole-branch review (`/review`) on the most capable model.

## Review Focus

1. An EOA or random contract calls `recordMiss` / `recordContribution` / `recordCompleted`: no revert and no record changes. (Task 1, `test_recordsFromNonSquadsAreIgnored`.)
2. A factory is revoked and later re-allowed: its squads' writes are ignored while revoked and count again after. (Task 1, `test_revokedFactorySquadWritesAreIgnored`.)
3. A trust-counting squad has a member miss while its factory is revoked: the deposit still covers the miss, the squad finishes, and the jar ends at exactly 0. (Task 1, `test_trustSquadFinishesAfterFactoryRevoked`.)
4. `TOKEN` points at an address with no code (typo, EOA): the deploy reverts before broadcasting anything. (Task 3, Step 3 check.)
5. Demo squads keep writing nothing, before and after the change. (Existing `test_completedRecordedOnlyForBigEnoughSquads`; must still pass unchanged.)

---

### Task 1: Registry ignores trust writes from non-squads

**Files:**
- Modify: `contracts/src/TrustRegistry.sol:7-8, 45-53, 68-79`
- Test: `contracts/test/TrustRegistry.t.sol:29-32, 40-47`, `contracts/test/SquadRounds.t.sol` (new test at the end)
- Docs: `contracts/README.md` ("Replacing a factory", line ~93-101), `TODOS.md:13`, `docs/superpowers/plans/2026-10-03-contracts-execution.md` (section 7, the "Any contract change after M5" paragraph), `docs/superpowers/specs/2026-10-02-squadjar-design.md:111`

**Interfaces:**
- Consumes: Base helpers `_squadWith(n, c, period)`, `_start`, `_lockAll`, `_turn`, `_payAllExcept`, `_warpPastGrace`; `registry.records(addr) returns (uint32 onTime, uint32 late, uint32 missed, uint32 completed)`. The test contract owns `registry` (Base `setUp` passes `address(this)`).
- Produces: unchanged ABI. `recordContribution(address,bool)`, `recordMiss(address)`, `recordCompleted(address)` become no-ops for callers where `isSquad(msg.sender)` is false.

- [ ] **Step 1: Rewrite the two registry tests (failing first)**

In `TrustRegistry.t.sol`, replace `test_recordsOnlyFromRegisteredSquads` and `test_revokedFactorySquadsCannotWrite` with:

```solidity
function test_recordsFromNonSquadsAreIgnored() public {
    registry.recordMiss(users[1]);
    registry.recordContribution(users[1], false);
    registry.recordCompleted(users[1]);
    (uint32 on, uint32 late, uint32 missed, uint32 done) = registry.records(users[1]);
    assertEq(on + late + missed + done, 0);
}

function test_revokedFactorySquadWritesAreIgnored() public {
    vm.prank(users[0]);
    address s = factory.createSquad(C, 5, SquadFactory.Period.Demo, INVITE, 0);
    registry.setWriter(address(factory), false);
    vm.prank(s);
    registry.recordMiss(users[1]);
    (,, uint32 missed,) = registry.records(users[1]);
    assertEq(missed, 0);
    registry.setWriter(address(factory), true); // re-allowed: writes count again
    vm.prank(s);
    registry.recordMiss(users[1]);
    (,, missed,) = registry.records(users[1]);
    assertEq(missed, 1);
}
```

- [ ] **Step 2: Add the squad-level test at the end of `SquadRounds.t.sol`**

`test_trustSquadFinishesAfterFactoryRevoked`: `_squadWith(5, C, SquadFactory.Period.Weekly)`, `_start`, `_lockAll`, `assertTrue(s.countsForTrust())`. Round 1: `_payAllExcept(s, address(0))`. Then `registry.setWriter(address(factory), false)`. Round 2: `_payAllExcept(s, _turn(s, 3))`, `_warpPastGrace(s)`, `s.settleRound(2)` (turn 3 misses; their deposit covers it). Rounds 3-5: `_payAllExcept(s, address(0))` each. Assert:
- `uint8(s.state()) == uint8(Squad.State.Completed)`
- `token.balanceOf(address(s)) == 0`
- for every member `m` (loop `memberAt(0..4)`): `records(m)` is exactly `(1, 0, 0, 0)`: the round 1 on-time write counted, nothing written after the revoke.

- [ ] **Step 3: Run the new and rewritten tests and confirm they fail**

Run: `wsl -e bash -ic "cd /mnt/c/Users/user/Documents/squadjar/contracts && forge test --match-test 'test_recordsFromNonSquadsAreIgnored|test_revokedFactorySquadWritesAreIgnored|test_trustSquadFinishesAfterFactoryRevoked' -vv"`
Expected: all three FAIL with `NotSquad()` reverts.

- [ ] **Step 4: Change `TrustRegistry`**

Delete the `onlySquad` modifier. In each of `recordContribution`, `recordMiss`, `recordCompleted`, start the body with `if (!isSquad(msg.sender)) return;` and drop the modifier from the signature. Keep `error NotSquad();` with a comment that it stays for ABI compatibility. Update the contract doc comment (lines 7-8) and the `isSquad` comment (line 45): writes from addresses that are not live squads are ignored, never reverted, so revoking a factory stops its squads' trust writes without freezing their money.

- [ ] **Step 5: Run the full suite**

Run: `wsl -e bash -ic "cd /mnt/c/Users/user/Documents/squadjar/contracts && forge test"`
Expected: 68 tests + 2 invariants pass (67 + 1 new; the 2 rewritten keep the count), no warnings. `test_historySurvivesNewFactory` and `test_completedRecordedOnlyForBigEnoughSquads` pass unchanged.

- [ ] **Step 6: Update the docs**

- `contracts/README.md`, "Replacing a factory": revoking an old factory with `registry.setWriter(old, false)` is now safe at any time. Its squads keep paying, settling and finishing; only their trust writes are ignored from then on. Re-allowing it makes their writes count again. Remove the "pause" and "only revoke after those squads finish" wording, and any error-catalogue line saying members see the registry's `NotSquad()` on `contribute`/`settleRound` (they no longer do).
- `TODOS.md`: delete the line starting `- **Factory revocation pauses squads.**`.
- Execution plan section 7: replace the "revoke the old factory only after its trust-counting squads have finished, because revoking pauses them" wording with "revoking the old factory is safe; its squads keep running but stop writing trust"; keep "keep the old factory's address".
- Spec line 111: "Dust goes to the collector of turn `n`." becomes "Dust goes to the last member still paying."

- [ ] **Step 7: Commit**

```bash
git add contracts/src/TrustRegistry.sol contracts/test/TrustRegistry.t.sol contracts/test/SquadRounds.t.sol contracts/README.md TODOS.md docs/superpowers/plans/2026-10-03-contracts-execution.md docs/superpowers/specs/2026-10-02-squadjar-design.md
git commit -F <tempfile>   # subject: "fix(contracts): ignore trust writes from revoked squads instead of freezing them"
```

---

### Task 2: Gap tests from the contracts review

Tests only. No production code changes. If a test fails against current code, stop and report it; do not change `src/`.

**Files:**
- Test: `contracts/test/SquadSetup.t.sol`, `contracts/test/SquadRounds.t.sol`

**Interfaces:**
- Consumes: Base helpers (Task 1 list), `SquadSetupTest._anchored(uint64 firstDeadline)` (3-member Demo squad, started), `Squad.countsForTrust()`, `Squad.RoundNotOpen(uint64 opensAt)`, `Squad.roundLength()` (Demo 300).
- Produces: nothing new.

- [ ] **Step 1: Add the tests**

- `SquadRounds.t.sol`, `test_trustGateNeedsContributionOf1000`: Weekly, 5 members, `c = 999e18` → after `_start` + `_lockAll`, `countsForTrust()` is false. Same with `c = 1000e18` → true.
- `SquadRounds.t.sol`, `test_trustGateNeedsFiveMembers`: Weekly, 4 members, `c = C` → `countsForTrust()` false.
- `SquadSetup.t.sol`, `test_roundOneNotOpenBeforeAnchor`: `anchor = uint64(block.timestamp + 1000)`, `s = _anchored(anchor)`, `_lockAll(s)`, `assertEq(s.roundDeadline(), anchor)`; then `vm.prank(s.memberAt(0))`, `vm.expectRevert(abi.encodeWithSelector(Squad.RoundNotOpen.selector, anchor - 300))`, `s.contribute()`; then `vm.warp(anchor - 300)` and the same member's `contribute()` succeeds.
- `SquadSetup.t.sol`, extend `test_organizerDroppedSquadContinues`: after the existing asserts, play 3 rounds with `_payAllExcept(s, address(0))`, then assert state `Completed` and `token.balanceOf(address(s)) == 0`.

- [ ] **Step 2: Run them**

Run: `wsl -e bash -ic "cd /mnt/c/Users/user/Documents/squadjar/contracts && forge test --match-test 'test_trustGate|test_roundOneNotOpenBeforeAnchor|test_organizerDroppedSquadContinues' -vv"`
Expected: all pass against current code. These pin existing behaviour; a failure means a real bug to report.

- [ ] **Step 3: Full suite, then commit**

Run: `forge test` (WSL). Expected: 71 tests + 2 invariants pass.

```bash
git add contracts/test/SquadSetup.t.sol contracts/test/SquadRounds.t.sol
git commit -F <tempfile>   # subject: "test(contracts): trust gate boundaries, round one opening, dropped organizer to completion"
```

---

### Task 3: Deploy script can reuse the existing token

**Files:**
- Modify: `contracts/script/Deploy.s.sol` (inside `run()`, before `new TrustRegistry`)
- Docs: `contracts/README.md` (Commands table)

**Interfaces:**
- Consumes: env var `TOKEN` (address, optional).
- Produces: when `TOKEN` is set, `deployments/<chainId>.json` keeps that `token` and gets new `registry` and `factory`; when unset, behaviour is unchanged (deploys a new `AjoNGN`).

- [ ] **Step 1: Implement**

`address existing = vm.envOr("TOKEN", address(0));` read before broadcasting. If nonzero, `require(existing.code.length > 0, "TOKEN has no code on this chain");` and use `AjoNGN(existing)`; otherwise `new AjoNGN()` inside the broadcast as today. Log `"reused token"` vs `"token"` so the output says which happened.

- [ ] **Step 2: Verify locally on Anvil**

In WSL from `contracts/`: start `anvil --silent &`, run the script once without `TOKEN`, read `token` from `deployments/31337.json`, run again with `TOKEN=<that address>`, then `pkill anvil`.
Expected: second run's JSON has the same `token`, different `registry` and `factory`; `cast call <new factory> "token()(address)"` returns the reused token.

- [ ] **Step 3: Verify the fail-closed path**

Against a fresh Anvil: `TOKEN=0x000000000000000000000000000000000000dEaD forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545`
Expected: reverts with `TOKEN has no code on this chain`, nothing broadcast.

- [ ] **Step 4: README Commands row**

Add: `| Redeploy keeping the token | TOKEN=<token address> forge script script/Deploy.s.sol --rpc-url monad_testnet --account <keystore> --sender <address> --broadcast |`.

- [ ] **Step 5: Full suite, then commit**

Run `forge test` (WSL). Expected: unchanged count, all pass.

```bash
git add contracts/script/Deploy.s.sol contracts/README.md
git commit -F <tempfile>   # subject: "feat(contracts): deploy script can reuse an existing token"
```

---

### Task 4: Testnet redeploy and handoff (human + controller, not a subagent task)

Needs the user's keystore password, so it is a stop point for automated execution.

**Files:**
- Modify: `contracts/deployments/10143.json`, `contracts/README.md` (Monad testnet deployment table)

- [ ] **Step 1 (user):** in the WSL terminal, from `squadjar/contracts`:

```bash
TOKEN=0xb7A57BeF0DD01A96C7626fDD6F143C9127d110C9 forge script script/Deploy.s.sol --rpc-url monad_testnet --account squadjar-deployer --sender 0xfAc4f942A7c8232c7a7D8b654F8580e00a368dF6 --broadcast
```

Expected: `reused token 0xb7A5…`, new `registry` and `factory`, `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`.

- [ ] **Step 2 (controller):** verify the new `TrustRegistry` (constructor arg: deployer address) and `SquadFactory` (constructor args: token, new registry) on public Sourcify (`--verifier sourcify`, no URL) and on BlockVision (`--verifier-url https://sourcify-api-monad.blockvision.org/`, trailing slash). Expected: `exact_match` for both on both.

- [ ] **Step 3 (controller):** smoke test with `cast call` on `monad_testnet`: new factory `token()` == `0xb7A57BeF0DD01A96C7626fDD6F143C9127d110C9`; new factory `registry()` == new registry; new registry `isWriter(new factory)` == true; new registry `owner()` == `0xfAc4f942A7c8232c7a7D8b654F8580e00a368dF6`. Run `script/export-abi.sh` and confirm `git diff contracts/abi` is empty.

- [ ] **Step 4 (controller):** update the README deployment table (date, new registry and factory, token unchanged, blocks), commit `deployments/10143.json` and the README with subject `chore(contracts): redeploy registry and factory on Monad testnet`.

- [ ] **Step 5 (handoff):** after the PR merges, faroukobayanju sets `NEXT_PUBLIC_FACTORY` to the new factory address in Vercel and redeploys. `NEXT_PUBLIC_TOKEN` stays. Squads created on the old factory stay on chain but stop showing in the app.
