# Onboarding and Public Squads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Teach new users how Squadjar works, and let organizers list public squads that anyone eligible can find and join, alongside today's private (link + code) squads.

**Architecture:** No contract changes. A public squad's invite code stays secret in Neon; the API releases it only to members, to requesters who meet the squad's minimum tier, and (if approval is on) only after the organizer accepts them. Tier comes from `TrustRegistry.tier(address)` onchain. The organizer can still `remove()` anyone while the squad is Open.

**Tech Stack:** Next.js 16 App Router (read `app/AGENTS.md`), React 19, Tailwind v4, viem, `@neondatabase/serverless`, Privy (`requireUser` in `app/lib/auth-server.ts`).

**Spec:** `docs/superpowers/specs/2026-10-02-squadjar-design.md`. Decisions from the user on 2026-10-05: onboarding after first login + landing; trust gate enforced in the app only (contract later); public-squad criteria = minimum tier, approve each joiner, short description.

## Global Constraints

- UI copy never shows: wallet, crypto, token, gas, transaction, blockchain, stake, address, default. `npm run check:copy` must pass.
- Glossary terms only (`CONTEXT.md`): Squad, Jar, Member, Organizer, Contribution, Round, Payout, Collector, Turn, Deposit, Miss, Late, Stopped paying, Trust score, Tier.
- Visuals follow `DESIGN.md` and reuse existing components (`AppShell`, `BackLink`, `Notice`, `PALM_BTN`/ink buttons in `app/components/squad/ui.tsx`). Palm is for money actions only.
- Schema changes are additive in `app/db/schema.sql` (`add column if not exists`, `create table if not exists`); run `npm run db:migrate` (it targets the shared Neon DB).
- Every API route uses the `route()` wrapper and returns 503 when not configured; addresses lowercase.
- Demo mode (no env) keeps working; new live-only UI hides in demo.
- Checks: `npx tsc --noEmit`, `npm run build`, `npm run check:copy`, each `node lib/<x>.check.ts`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A public squad's invite code is never returned to someone who isn't a member, isn't eligible by tier, or (with approval on) isn't accepted.
2. Only the organizer (onchain `organizer()`) can accept or decline requests.
3. A user below the minimum tier sees why they can't join, not a broken button.
4. Onboarding shows once after the name step, never blocks returning users, and can be replayed.

---

### Task 1: Onboarding

**Files:** Create `app/components/how-it-works.tsx`, `app/app/intro/page.tsx`. Modify `app/app/welcome/page.tsx` (after saving, go to `/intro?next=…`), `app/app/page.tsx` (landing: "How it works" section using the same content), `app/app/profile/page.tsx` (link "How Squadjar works" → `/intro?next=/profile`).

- Four cards, swipeable (scroll-snap) with Next / Skip and dots:
  1. "Save together, nobody holds the money": everyone pays the same contribution each round into the squad's jar; no member can touch it.
  2. "Everyone gets a turn": each round one member is the collector and gets the whole jar; turns are set when the squad starts, best payment record first.
  3. "Your deposit protects the squad": everyone locks a refundable deposit; if someone misses, the deposit covers it so the collector is still paid in full; it comes back at the end.
  4. "Pay on time, earn trust": on-time payments raise your trust score, which unlocks earlier turns and smaller deposits; quick demo squads don't count.
- `/intro` renders the cards; Done/Skip goes to `safeNext(next)`. Mark seen in `localStorage` (`squadjar-intro-seen`, try/catch) so welcome→intro happens once per device.
- Verify: tsc, build, check:copy; dev server: `/intro` renders, Skip and Done navigate; landing shows the section.

### Task 2: Public squads

**Files:** Modify `app/db/schema.sql`, `app/app/api/squads/route.ts` (accept `visibility`, `description`, `minTier`, `approval`), `app/app/api/squads/[slug]/route.ts` (return the public fields), `app/app/api/squads/[slug]/invite/route.ts` (also release to eligible/accepted requesters), `app/app/squads/new/page.tsx`, `app/app/squads/page.tsx`, `app/app/s/[slug]/page.tsx`, `app/components/squad/open.tsx`, `app/lib/live/actions.ts` (`createSquad` sends the new fields; new actions below), `app/lib/types.ts`. Create `app/app/api/squads/public/route.ts`, `app/app/api/squads/[slug]/requests/route.ts`, `app/lib/public-squads.check.ts` (pure eligibility logic).

- Schema:
  ```sql
  alter table squads add column if not exists visibility text not null default 'private' check (visibility in ('private','public'));
  alter table squads add column if not exists description text check (description is null or char_length(description) <= 80);
  alter table squads add column if not exists min_tier int not null default 0 check (min_tier between 0 and 2);
  alter table squads add column if not exists approval boolean not null default false;
  create table if not exists join_requests (
    squad text not null references squads(address),
    member text not null,
    status text not null default 'pending' check (status in ('pending','accepted','declined')),
    created_at timestamptz not null default now(),
    primary key (squad, member)
  );
  ```
- Pure helper `canRequest({ tier, minTier })` and `codeReleasable({ isMember, tier, minTier, approval, requestStatus })` in a small module with a `.check.ts`.
- API:
  - `GET /api/squads/public` (public): Open public squads (read state onchain, skip non-Open) → `[{ slug, name, description, minTier, approval, contribution, period, members, maxMembers }]`, newest first, max 50.
  - `POST /api/squads/[slug]/requests` (auth): public squads only; reads caller tier from the registry; below `minTier` → 403 `{ error: "tier" }`. If `approval` is false → upsert `accepted` and return `{ status: "accepted", code }`. Else upsert `pending` (don't downgrade accepted) → `{ status: "pending" }`.
  - `GET /api/squads/[slug]/requests` (auth): organizer → pending list with display names and tiers; anyone else → their own `{ status }`.
  - `PATCH /api/squads/[slug]/requests` (auth, organizer only via onchain `organizer()`) `{ member, decision: "accepted" | "declined" }`.
  - `GET /api/squads/[slug]/invite`: returns `code` to members (as today) or to a requester whose request is `accepted` and who still meets `minTier`.
- Screens:
  - Create: "Who can join?" Private (link and code) / Public (anyone can find it). Public shows: one-line description (≤80), minimum tier (Anyone / Building and up / Reliable only; default Anyone, and for Quick demo note "Quick demo squads don't build trust, so everyone starts New"), "Approve each person" toggle.
  - Squads tab: "Find a squad" section listing public squads (name, description, ₦ amount, period, seats left, tier badge) linking to `/s/<slug>`.
  - Non-member on a public Open squad: description, requirements, then "Join squad" (no approval, eligible), "Request to join" (approval), "Request sent" (pending), "Not accepted" (declined), or "This squad is for Building members and up. Pay on time in your squads to grow your trust score." (tier too low). Joining fetches the code from `/invite` then calls the existing `join(slug, code)`.
  - Organizer, Open public squad: a "Join requests" list with Accept / Decline.
- Verify: tsc, build, check:copy, the new check; curl: `/api/squads/public` 200; requests without auth 401.
