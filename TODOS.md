# TODOS

## Contracts

- **Turn-order randomness.** `block.prevrandao` may be constant on Monad testnet, and the organizer picks when `start()` runs. Fix: commit-reveal, or a seed from a later block. Check on deploy day (Task 6 Step 6). P3.
- **Signed invites.** The invite code is public calldata after the first join. Organizer `remove()` mitigates this. Proper fix: the organizer signs `(squad, member)` and `join` verifies it. P3.
- **Fairness invariants.** Fuzz `finalizeDeposits` and `cancel`, and assert "a member who stopped paying never ends with more than they started" plus "a member with no misses loses at most X". P2.
- **Social vouching / uncollateralized slots.** This is the 12-month credit story (CEO review). P3.
- **Multisig registry owner** before any mainnet deploy. P2.
- **Seed script** for a demo squad, owned by Plan 2. P2.
