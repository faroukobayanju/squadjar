---
# gstack: design-md-format=spec
name: Squadjar
description: The ajo contribution card, rebuilt for a Gen-Z squad. Manila paper, ruled ledger lines, rubber-stamp ink, warm and permanent.
colors:
  manila: "#F2EADB"
  surface: "#FFFAF1"
  text: "#1C1915"
  text-muted: "#6F6253"
  rule: "#E2D6C0"
  primary: "#E4572E"
  primary-press: "#C9461F"
  on-primary: "#FFFFFF"
  accent: "#2B3CC4"
  success: "#2E7D4F"
  warning: "#B7791F"
  error: "#B42318"
  dark-manila: "#1A1712"
  dark-surface: "#24201A"
  dark-text: "#F2EADB"
  dark-text-muted: "#A99A86"
  dark-rule: "#3A3328"
  dark-primary: "#F06A43"
  dark-primary-press: "#E4572E"
  dark-on-primary: "#1A1712"
  dark-accent: "#8E99FF"
  dark-success: "#5FBF86"
  dark-warning: "#E0A84A"
  dark-error: "#F07466"
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontWeight: 800
    fontSize: 2.1rem
    lineHeight: 1
    letterSpacing: -0.03em
  display-moment:
    fontFamily: Bricolage Grotesque
    fontWeight: 800
    fontSize: clamp(2.6rem, 12vw, 3.2rem)
    lineHeight: 0.95
    letterSpacing: -0.04em
  headline:
    fontFamily: Bricolage Grotesque
    fontWeight: 800
    fontSize: 1.6rem
    lineHeight: 1.25
    letterSpacing: -0.03em
  money-hero:
    fontFamily: Zilla Slab
    fontWeight: 700
    fontSize: clamp(4rem, 23vw, 7rem)
    lineHeight: 0.9
    letterSpacing: -0.02em
    fontFeature: tnum
  money:
    fontFamily: Zilla Slab
    fontWeight: 700
    fontSize: 1.25rem
    fontFeature: tnum
  body:
    fontFamily: Instrument Sans
    fontWeight: 400
    fontSize: 1rem
    lineHeight: 1.5
  label:
    fontFamily: Instrument Sans
    fontWeight: 600
    fontSize: 0.75rem
  mono:
    fontFamily: JetBrains Mono
    fontWeight: 400
    fontSize: 0.75rem
    fontFeature: tnum
rounded:
  sm: 4px
  md: 10px
  lg: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.money}"
    rounded: "{rounded.lg}"
    height: 56px
  button-primary-press:
    backgroundColor: "{colors.primary-press}"
  button-ink:
    backgroundColor: "{colors.text}"
    textColor: "{colors.manila}"
    rounded: "{rounded.lg}"
    height: 56px
    padding: 0 28px
  button-ghost:
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    height: 52px
  paid-label:
    textColor: "{colors.text-muted}"
    rounded: "{rounded.lg}"
    height: 56px
  action-bar:
    backgroundColor: "{colors.manila}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  stamp-sm:
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    size: 28px
  stamp-md:
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    size: 40px
  stamp-lg:
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    size: 64px
  empty-box:
    rounded: "{rounded.sm}"
    size: 28px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: 52px
    padding: 0 12px
  chip-amount:
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 0 16px
  chip-amount-selected:
    backgroundColor: "{colors.text}"
    textColor: "{colors.manila}"
  tab-active:
    textColor: "{colors.text}"
    height: 56px
  tab-inactive:
    textColor: "{colors.text-muted}"
    height: 56px
---

# Squadjar

## Overview

**Creative North Star: "The Stamped Card"**

The esusu collector's cardboard contribution card, owned by a squad of students. It earns trust from a ritual Nigerian families already believe in, not from shields, locks or navy blue. The surface is manila paper with a real fiber grain, cards are lighter paper with ruled ledger lines, and a payment is a rubber stamp pressed in blue ink. Ink is permanent, so a stamp reads as "can't be erased".

The system is dense where it records (the card, the ledger meta) and loud in only two places: the payout figure and the palm-orange action that moves money. Everything else is ink on paper. Depth comes from paper on paper, never from light.

**Key Characteristics:**
- People come before money. The squad screen leads with who collects next. Home is the one exception: it carries the balance block (amount in Zilla Slab plus the Add money / Send / Withdraw / History row), below the greeting and tier.
- Payments are ink stamps with initials, not checkmarks.
- Paper and ink materials: a raster fiber ground, 40px ruled ledger lines, raster ink-pressure masks on every stamp.
- One loud color. Palm-oil orange belongs to Pay (including Pay back), Add money and the current-round tint, nothing else.
- One authored motion: the stamp thunk.

## Colors

Manila and ink set the room; palm orange means "money moves"; stamp blue means "done and recorded".

### Primary
- **Palm-Oil Orange** (primary, pressed primary-press): the Pay button (and Pay back, which pays a debt), the Add money action (filled on its own screen, a palm text link on Home), and the current round's 10% tint on the card. Also the text caret in inputs.

### Secondary
- **Stamp-Pad Blue** (accent): stamp rings and initials, the PAID OUT and COLLECTED marks, the focus ring, the selection tint (22%), the active trust tier pill (10% fill) and paid dots on squad list rows (15% fill).

### Neutral
- **Manila** (manila): the page ground, the docked action bar and the tab bar.
- **Card Paper** (surface): cards, the ledger, inputs, receipt panels.
- **Ink** (text): body text, headlines, and the fill of every non-money CTA (with manila text).
- **Faded Ink** (text-muted): meta, secondary copy, inactive tabs, empty boxes at 70%. Darkened one step from the seed value so it holds 4.5:1 on manila, which is why it may carry 12px mono meta.
- **Pencil Rule** (rule): card borders, ledger lines, list dividers, dashed receipt dividers, ghost link underlines.

### Semantic
- **success / warning / error**: error is the only one with a reused pattern (alerts at 8% fill and 40% border, the "missed" mark in the ledger).

### Dark mode
Lives in `globals.css` under `prefers-color-scheme: dark`, using the `dark-*` tokens. The manila becomes warm charcoal, surfaces stay one step lighter than the page, stamp blue lifts to a periwinkle for contrast, and text on palm flips to the dark ground. The paper tile is inverted at 25% opacity. It is not a straight inversion.

### Named Rules
**The Money Moves Rule.** Palm orange appears only on Pay, Pay back, Add money and the current-round tint. Every other CTA ("Start a squad", "Invite on WhatsApp", "Tell the squad", "Add ₦X" when short) is an ink button.

**The Ink Means Recorded Rule.** Stamp blue marks something already done. Never use it for a pending action.

## Typography

**Display Font:** Bricolage Grotesque 800 (loaded at 500 and 800)
**Money Font:** Zilla Slab 700 with tabular figures (loaded at 500 and 700)
**Body Font:** Instrument Sans (400, 500, 600)
**Label/Mono Font:** JetBrains Mono (400, 500)

**Character:** A tight, chunky grotesque for names, a stamped slab for every naira, and a typewriter mono for the ledger. All four load through `next/font/google`.

### Hierarchy
- **Display** (800, 2.1rem, 1): screen titles and squad names, left-aligned, balanced.
- **Display moment** (800, clamp(2.6rem, 12vw, 3.2rem), 0.95): the payout headline only.
- **Headline** (800, 1.6rem): the countdown line, "Bola collects in 2d 4h".
- **Money hero** (Zilla 700, clamp(4rem, 23vw, 7rem), 0.9): the round's payout figure on the squad screen. The payout receipt uses a smaller step (clamp(3.6rem, 19vw, 5rem)).
- **Money** (Zilla 700, 1.25rem): the Pay button label and amounts inline (13px in meta lines).
- **Body** (400, 1rem, 1.5): explanatory copy, held to 34 to 38ch.
- **Label** (600, 0.75rem): tab labels, member names under stamps, section heads at body size in 600.
- **Mono** (400, 0.75rem, tnum): ledger meta, round headers (R1, R2), counts ("3 of 8 paid"), receipt rows at 13px.

### Named Rules
**The Stamped Naira Rule.** Every amount is Zilla Slab with `₦` and thousands separators (`₦40,000`), tabular figures on.

## Layout

One centered column, max 480px, 16px side gutters. Blocks are separated by 32 to 48px (`mt-8`, `mt-10`, `mt-12`). The bottom of every app screen is a sticky dock: the screen's one action above a three-tab bar (Home, Squads, Profile), both on solid manila. Tap targets are at least 48px; primary CTAs are 56px.

**Payday Countdown (the squad screen), top to bottom:**
1. Header: squad name in Display, then a mono meta line "Round 3 of 8 · ₦5,000 each · Weekly".
2. Next payout: the Headline "Bola collects in 2d 4h" with a live countdown ticking each second, the payout figure in Money hero, then one muted line saying the jar pays automatically.
3. This round: a four-column grid of large stamps (64px) or empty boxes with names beneath, a mono "N of M paid" count, and a WhatsApp "Remind" link when anyone is outstanding.
4. The card: the full stamp card, starting below the fold, then a lock-icon line about held money (what waits in the jar at your turn, what waits now, or that it came back).
5. Dock: "Pay ₦5,000" in palm, or the muted paid label once stamped.

**The card** is a ledger table: members down the side in turn order, rounds across, the name column pinned while rounds scroll sideways. Rows are 40px so they land on the ruled lines.

## Elevation & Depth

Flat. No shadows exist in the build. Depth is paper on paper: a card-paper surface on manila with a 1px rule border, over a raster fiber tile (256px, fixed layer, 0.55 opacity; inverted at 0.25 in dark mode). Ledger rules are a 40px pitch drawn inside the card.

### Named Rules
**The Paper Not Light Rule.** No shadows, glows, blurs or frosted glass. The action bar is solid manila.

## Shapes

- Large (14px) for cards, buttons and the paid label; medium (10px) for inputs and alerts; small (4px) for empty boxes; full for stamps, chips and tier pills.
- Stamps are circles tilted between −2° and −12°, chosen per member and round by a stable hash, with one of four ink masks chosen the same way, so no two look identical.
- Rectangular marks (PAID OUT, COLLECTED) are square-cornered, tilted −6° and −12°.

## Components

### Buttons
- **Shape:** gently rounded (14px), full width in the dock.
- **Primary (Pay):** palm fill, white Zilla Slab label with the amount, 56px. Press scales to 0.98 and darkens to primary-press in 75ms. Loading reads "Stamping…".
- **Ink:** ink fill with manila text, 56px, semibold Instrument Sans, press scales to 0.98. Used for every CTA that doesn't move money.
- **Ghost:** 1.5px ink border, 52px, same press.
- **Focus:** a 3px stamp-blue outline with a 3px offset, everywhere.

### Paid label
Replaces Pay in the dock once you've paid: a rule-bordered 56px box with muted semibold text, "Paid round N. Your stamp is on the card."

### Chips
Amount quick-picks: 44px pills with a 1.5px rule border and a Zilla label; selected fills with ink and manila text.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** card paper, 1px rule border, dividers in rule. No nested cards.

### Inputs / Fields
- **Style:** 52px, 10px radius, 1.5px faded-ink border at 60%, card-paper fill, labels above. The caret is palm.
- **Focus:** the border turns stamp blue.
- **Error:** an alert below at 8% error fill and 40% error border, saying what happened and what to do next.

### Navigation
Three equal tabs, 56px, Phosphor icons at 22px (fill weight when active), 12px semibold labels; active is ink, inactive muted. The top border is a 1px rule.

### Stamp (signature)
A ring of stamp blue with initials in mono 500, at 0.92 opacity, masked by one of four raster ink-pressure masks (ink-1..4) that break up the ring but keep the center solid so the initials stay legible. Three sizes: sm 28px (2px ring, 9px initials) in the card, md 40px (2.5px, 11px), lg 64px (3px, 16px) in the round row.

**The thunk:** a fresh stamp drops in from 1.9× scale, −24° and transparent, and lands at its tilt on a spring (stiffness 520, damping 22, mass 0.9), with `navigator.vibrate(20)`. On the payout receipt, a COLLECTED mark lands from 2.2× and −26° to −12° on a spring (420/20) after 250ms. With `prefers-reduced-motion`, both appear in place instantly.

### Empty box
A 4px-radius square with a 1.5px dashed border in faded ink at 70%, sized to match the stamp it awaits (28/40/64px).

### PAID OUT mark
A rectangular stamp-blue mark with a 2px border, 8px mono, tilted −6°, set across the collector's box on past rounds.

## Do's and Don'ts

### Do:
- **Do** keep palm orange for Pay, Pay back, Add money and the current-round tint only.
- **Do** render every amount in Zilla Slab with `₦` and thousands separators.
- **Do** name people. "Bola collects this round" beats "Recipient: 0x…".
- **Do** size empty boxes to the stamp they wait for, so the row reads as gaps in ink.
- **Do** land ledger rows on the 40px rules.

### Don't:
- **Don't** use green checkmarks for payments. Payments are blue stamps.
- **Don't** use shadows, glows, blur, gradients or confetti.
- **Don't** lead a squad screen with the user's balance; Home's balance block is the only place it is prominent.
- **Don't** use system-ui or an unloaded font as the visible face.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-02 | Initial design system: "The Stamped Card" | Created by /design-consultation. An independent subagent proposed it, and it was adopted with JetBrains Mono replacing Space Mono (on the overused list). Fonts verified on Google Fonts. Built from built-in design knowledge, without competitor research. |
| 2026-10-02 | Reconciled to the shipped build | Muted ink darkened to #6F6253 for 4.5:1; dark stamp blue #8E99FF; ledger pitch 40px; stamps in three sizes with raster ink masks; raster paper tile; palm narrowed to Pay, Add money and the current-round tint; no shadows (the phone-frame shadow was never built); motion folded into Components. |
