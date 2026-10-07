# Squadjar

Squadjar lets a group of people run a rotating savings arrangement (ajo/esusu) where no single person holds the money. Everyone pays in each round, and one member collects the whole amount.

## Language

### Groups and people

**Squad**:
A fixed group of 3 to 20 members running one rotating savings arrangement together.
_Avoid_: Circle, group, ajo, pool

**Jar**:
The squad's shared money, which no member controls. Contributions go into it and payouts come out of it.
_Avoid_: Pot, pool, account, treasury

**Member**:
A person who belongs to a squad, owes contributions, and has one turn.
_Avoid_: Participant, user (when meaning a squad member)

**Organizer**:
The member who created the squad. They have no powers once rounds begin.
_Avoid_: Admin, treasurer, owner, class rep

**Leaving**:
A member exiting a squad before rounds begin, with no penalty.

### Money and rounds

**Contribution**:
The fixed amount each member pays into one round.
_Avoid_: Dues, payment, installment

**Round**:
One period of the cycle in which every member owes one contribution and exactly one member collects.
_Avoid_: Cycle, period, week

**Payout**:
The total of a round's contributions, paid from the jar to that round's collector.
_Avoid_: Pot money, withdrawal

**Collector**:
The member who receives the payout in a given round.
_Avoid_: Recipient, winner

**Turn**:
A member's fixed position in the payout order (turn 1 collects in round 1).
_Avoid_: Slot, position, rank

**Held**:
The part of a collector's payout kept in the jar until they have paid the rounds they still owe. It covers their own later misses and comes back to them at the end. How much is held depends on their tier.
_Avoid_: Deposit, stake, collateral, locked funds

**Miss**:
A contribution not paid by the end of the round's grace window.
_Avoid_: Default, skip

**Late**:
A contribution paid after the round deadline but inside the grace window.

**Debt**:
A missed contribution that the member's held money did not cover and that they have not paid back yet. Paying back sends it to the collector who was paid short.
_Avoid_: Loan, arrears, default

**Credit**:
The amount a collector was paid short because of someone's debt, and is still owed.
_Avoid_: Balance, refund, IOU

### Trust

**Trust score**:
One score per person, built from their payment history across every squad they have been in. It decides turn order and how much of a payout is held. Leaving does not affect it.
_Avoid_: Credit score, reputation, rating

**Tier**:
The named band a trust score falls into: New, Building, or Reliable.

**Naira balance**:
The money a user holds in the app, shown in ₦.
_Avoid_: Wallet, tokens, funds
