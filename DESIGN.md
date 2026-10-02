---
# gstack: design-md-format=spec
name: Squadjar
description: The ajo contribution card, rebuilt for a Gen-Z squad. Manila paper, ruled ledger lines, rubber-stamp ink, warm and permanent.
colors:
  manila: "#F2EADB"
  surface: "#FFFAF1"
  text: "#1C1915"
  text-muted: "#7A6D5E"
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
  dark-accent: "#7F8BFF"
  dark-primary: "#F06A43"
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontWeight: 800
    fontSize: clamp(2rem, 7vw, 3rem)
    letterSpacing: -0.03em
  money:
    fontFamily: Zilla Slab
    fontWeight: 700
    fontFeature: tnum
  body:
    fontFamily: Instrument Sans
    fontSize: 1rem
    lineHeight: 1.5
  label:
    fontFamily: Instrument Sans
    fontWeight: 600
    fontSize: 0.75rem
    letterSpacing: 0.01em
  mono:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontFeature: tnum
rounded:
  sm: 4px
  md: 10px
  lg: 14px
  phone: 28px
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
    rounded: "{rounded.lg}"
    minHeight: 56px
  button-primary-press:
    backgroundColor: "{colors.primary-press}"
  button-ghost:
    borderColor: "{colors.text}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    minHeight: 52px
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule}"
    rounded: "{rounded.lg}"
  stamp:
    borderColor: "{colors.accent}"
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    size: 26px
  input:
    borderColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    minHeight: 52px
  tab-active:
    textColor: "{colors.text}"
---

# Squadjar

## Overview

**Creative North Star:** The esusu collector's cardboard contribution card, owned by a squad of students. It earns trust from a ritual Nigerian families already believe in, not from shields, locks or navy blue.

**Product context:** A mobile-first PWA for Nigerian university students (18 to 24) running ajo/esusu rotating savings. Its peers are consumer fintechs (PiggyVest, Kuda, Cowrywise, Cash App). The blockchain underneath must stay invisible.

**Mode per surface:**
- Operate: home, squad detail, pay, create.
- Experience: the payout moment.
- Persuade: the landing and invite pages only.

**Memorable thing:** "Our squad's jar, and nobody can run with it." It should feel warm and social, and also safe and solid.

**Key characteristics:**
- People come before money. The contribution grid is the hero, and the balance is one quiet line.
- Payments are ink stamps, not checkmarks. Permanent ink stands for "can't be erased".
- Paper and ink materials, with a faint grain and ruled lines.
- One loud color. Palm-oil orange belongs only to the action that moves money.

## Colors

**Strategy:** Committed. Manila and ink set the room. Palm-oil orange (`primary`) is reserved for Pay and payout CTAs, so it always means "money moves". Stamp blue (`accent`) means "done and recorded": paid boxes, trust tier, focus rings.

**Light or dark:** Light by default. Students use it outdoors on campus and in daylight hostels. Dark mode exists for night use: the manila becomes a warm charcoal, and stamp blue lightens to keep contrast. It is not a straight inversion. Surfaces stay one step lighter than the page so the card hierarchy survives.

The muted ink tone is used for ledger meta only, never for body text under 14px.

## Typography

- **Bricolage Grotesque 800** is the display voice: squad names, screen titles, the payout headline. It is set tight and left-aligned, and never goes above 3rem in the app.
- **Zilla Slab 700** with tabular figures for every ₦ amount, so money looks stamped and solid, and columns line up.
- **Instrument Sans** for body and UI text. It is on the overused list as a *display* face, but it is allowed here because this is an Operate surface and it reads well at small sizes.
- **JetBrains Mono** for ledger meta: round numbers, timestamps, "R3 · paid 9:14pm".

Scale: display 3rem / 2.1rem / 1.2rem, body 1rem, meta 0.75rem. Levels differ by more than weight.

Loading: Google Fonts with `display=swap`, preconnect, and only the weights listed above (Bricolage 500 and 800, Zilla 500 and 700, Instrument 400, 500 and 600, Mono 400 and 500). In Next.js, use `next/font/google`.

## Layout

- Mobile-first, one column, with a max content width of 480px on larger screens (the phone frame stays centered).
- A bottom tab bar has three tabs: Home, Squads, Profile.
- Sticky primary action: on squad detail, the Pay button sits at the bottom, above the tabs.
- Rhythm: 16px gutters, 24px between blocks, 48px before a new section.
- Tap targets are at least 48px, and the primary CTA is 56px tall.
- The contribution grid scrolls horizontally past 5 rounds, with the member name column fixed. The current round is tinted with 8% primary.

## Elevation & Depth

Depth comes from paper, not light:
- Cards are `surface` on `manila` with a 1px `rule` border.
- Only the phone frame and sheets get a soft offset shadow (`0 18px 40px -24px rgba(28,25,21,.45)`).
- Ruled lines (34px pitch) sit inside the grid card.
- No glows and no frosted glass.

## Shapes

- `lg` (14px) for cards and buttons, `md` (10px) for inputs and alerts, `sm` (4px) for empty grid boxes, and `full` for stamps and the trust pill.
- A nested radius is the outer radius minus the gap.
- Stamps are circles, rotated between −2° and −12°, chosen per member and per round, so no two look identical.

## Components

- **Pay button:** primary background with white Zilla Slab text showing the amount. `:active` scales to 0.98 and uses `primary-press`. `:focus-visible` has a 3px accent outline with a 3px offset. Disabled is 40% opacity with the label "Paid ✓ round 3". Loading shows the label "Stamping…".
- **Stamp:** a 2px accent ring with initials in mono and a rough ink mask. A just-paid stamp plays the thunk animation once.
- **Collected / Paid out mark:** a rectangular stamp in the accent color, rotated −6°, with the text "PAID OUT".
- **Empty box:** a 1px dashed rule border at 24px.
- **Trust pill:** an accent outline pill with a "● Reliable · 22 on time" label.
- **Alerts:** a tinted background plus a border in the semantic color. The copy always says what happened and what to do next. Errors always say "Your money is safe."
- **Inputs:** 52px tall, labels above, ₦ prefix fixed inside amount fields, numeric keyboard (`inputmode="numeric"`).

## Do's and Don'ts

- Do: use palm orange only for actions that move money.
- Do: render every amount in Zilla Slab with `₦` and thousands separators (`₦40,000`).
- Do: name people. "Bola collects this round" beats "Recipient: 0x…".
- Do: design the empty, loading and error states for every list and action.
- Do: keep the glossary words: squad, jar, contribution, round, payout, deposit, missed, stopped paying.
- Don't: use the words wallet, crypto, token, gas, transaction, blockchain, stake, address or default anywhere in the UI.
- Don't: use green checkmarks for payments. Payments are blue stamps.
- Don't: use confetti, gradients, glow, emoji-as-icons, or cards inside cards.
- Don't: lead the home screen with a giant balance number.
- Don't: use system-ui or a font that isn't loaded as the visible face.

## Motion

- **Approach:** intentional.
- **Easing:** enter ease-out, exit ease-in, move ease-in-out.
- **Duration:**
  - micro 80ms (press)
  - short 180ms (sheets, alerts)
  - medium 320ms (screen transitions)
  - long 380ms (the stamp)
- **The one authored moment:** the stamp thunk. On a successful payment, the user's stamp drops from 1.8× scale and −20° rotation and lands at −8°, with `navigator.vibrate(20)` where supported. On payout, a large "COLLECTED" stamp lands on the receipt. Everything respects `prefers-reduced-motion`, which makes the stamp appear instantly.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-02 | Initial design system: "The Stamped Card" | Created by /design-consultation. An independent subagent proposed it, and it was adopted with JetBrains Mono replacing Space Mono (on the overused list). Fonts verified on Google Fonts. Built from built-in design knowledge, without competitor research. |
