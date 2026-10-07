# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + Tailwind CSS, deployed on Vercel as an installable PWA. Privy for login and embedded wallets (hidden from users); viem for Monad testnet reads/writes.

## Users

Anyone in Nigeria who already does ajo/esusu: students, young workers, traders, friend and family groups. Launch wedge: undergraduates (18–24) in class, department, or friend squads of 3–20 people, usually started by a class rep. They coordinate on WhatsApp, use mid-range Android phones on patchy mobile data, and are new to web3.

## Product Purpose

Squadjar runs ajo/esusu (rotating savings) with no treasurer. Members contribute a fixed amount each round into a jar no person controls; the jar pays that round's collector on schedule; refundable deposits cover anyone who misses; a trust score earned from payment history gives earlier turns. Success for the hackathon (deadline 2026-10-14): a real squad of 5+ classmates completes Demo rounds, and judges complete the core flow without sensing crypto.

## Positioning

No person ever holds the money. Other group-savings apps digitize the ledger but still leave one admin in control of the cash and the records.

## Operating Context

- Ajo/esusu is a familiar ritual: a collector's cardboard card with a box stamped per payment.
- Invites and reminders travel through WhatsApp group chats.
- Demo squads use 5-minute rounds; real squads are Weekly or Monthly.

## Capabilities and Constraints

- Core flow: login (email/Google) → add money (simulated test card checkout) → create squad → invite via WhatsApp → join → start → lock deposit → pay each round → automatic payout → deposit refund.
- Terminology follows `CONTEXT.md` (squad, jar, contribution, round, payout, collector, turn, deposit, missed, stopped paying, trust score, tier).
- UI must never show: wallet, crypto, token, gas, transaction, blockchain, stake, address, default.
- Currency is naira (₦) only. Network is Monad testnet.
- Reminders and nudges use fixed templates in English, Pidgin, Yoruba, Igbo and Hausa.

## Evidence on Hand

None yet: no real users, testimonials, or metrics. Do not fabricate any. User-test notes will land in `docs/user-test.md`.

## Product Principles

1. People before money: show who paid before showing balances.
2. Safety is visible: every payment is publicly recorded for the squad.
3. Zero crypto surface: the product reads as an ordinary money app.
4. Name the human: "Bola collects this round", never an identifier.
5. Every failure says the money is safe and what to do next.

## Accessibility & Inclusion

Mid-range Android phones, slow or interrupted data, outdoor daylight use: high contrast, tap targets ≥ 48px, fast first load, honest offline/error states.
