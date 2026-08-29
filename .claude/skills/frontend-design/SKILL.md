---
name: frontend-design
description: Use when designing, composing, or reviewing how a screen looks and behaves — visual hierarchy, spacing, colour, motion, empty and error states, accessibility, RTL, touch targets, or theme parity. The product's design doctrine and the checklist a UI change has to pass before it is done. Pair with the design-system skill, which lists the components this doctrine is built from.
---

# Design doctrine

Nura is a self-custodial wallet: it holds money and keys on a 360×640 window and on a phone.
The interface should read as an **instrument** — calm, dense, legible, predictable. Every
rule below exists because its absence shipped a bug or a mess.

## Material

**Surfaces are opaque.** They separate by three cheap things — a lightness step, a hairline,
and (only for what floats) one shadow. Never by translucency or blur. An alpha surface has
no colour of its own, and a full-viewport backdrop filter re-runs on every animation frame.

**Cards lift; they never recess.** A carved surface vanishes in the light theme and cannot
carry one meaning across the switch.

**Elevation is reserved for what actually floats.** Dialogs and sheets wear `shadow-float`.
Cards, rows and inputs cast nothing — `base-2` plus a hairline is all the separation a flat
palette needs, and a shadow under every card made the whole page float ambiguously.

**Corners are a three-step ramp**: 6px controls, 10px surfaces, 14px what floats. Tighter
corners read as instrument rather than toy, and the difference is legible only because
nothing else competes with it.

## Colour is information

**One accent hue does all the brand work** — emerald 168: primary actions, focus, selection,
and the credit side of a transaction. Error red is the only other hue in the product.
Nothing else is allowed one. Colour that changes meaning per screen is noise, and a wallet
has to stay calm.

**Contrast is checked by script, not by eye.** Body text ≥ 4.5:1 on every surface it can
land on; a reversed label ≥ 4.5:1 on every fill *including hover and active*; control
boundaries and the focus ring ≥ 3:1. `npm run check` parses the stylesheet and fails the
build. The ceiling on a fill's hover step is set by the label it still has to carry.

**Two line weights, and the distinction binds.** `line` is decorative — a card hairline, a
separator — and is free to be quiet, because the surface fill underneath already identifies
the card. `input-normal` is the boundary of a control the user has to *find*, so it clears
3:1 against its own fill.

## Motion

**This interface does not move its controls.** No hover lift, no press-scale. A control that
jumps off the page reads as decoration, and on a dense list the whole surface twitched
whenever the pointer crossed it. **State lives in the fill**: rest → hover → active are
background steps, where the eye already is.

- Durations come from `--duration-fast|base|surface`; nothing invents its own.
- Transition only the properties that change, never `transition-all`.
- Animation that isn't a state change belongs to `motion/react`, and dialogs animate their
  exit by living inside the page's `AnimatePresence`.
- `prefers-reduced-motion` is answered **globally** in `style.css` by collapsing durations to
  `0.01ms` rather than cancelling animations — several of these animations *end* in the
  state the interface needs, so cancelling would strand a dialog in its opening frame.
  Don't add a per-component reduced-motion branch.

## Density and rhythm

The wallet, holdings and history screens are columns of homogeneous rows. **Group them:**
one card, hairlines between rows (`ListCard`). A card per row turns a list into a stack of
boxes — heavy, and noisy at exactly the densities where scanning matters.

One job gets one metric. The submit button is `h-11` on every screen; when intro used `h-12`
and the dashboard `h-11`, onboarding read as a different application from the product.

## Typography

Five steps: 12 / 14 / 16 / 18 / 32. The body face is the platform's own, so every language
reads in its OS voice. **`font-mono` is the machine register** — addresses, hashes, amounts —
and nothing else. It is never the app's default face.

## Accessibility is not a pass at the end

- **Focus is `focus-visible`, one colour, app-wide.** A ring that changes colour by variant
  is a ring the eye must re-learn. The resting outline is transparent so focusing changes
  only a colour and nothing reflows.
- **44px minimum touch target.** Icon buttons are 32–40px squares by design; `tap-44` grows
  the hit area without changing a pixel that's drawn. Never scale the glyph up instead.
- **A dialog is a role, a name, a focus trap and an Escape.** Use `Modal`/`Sheet`.
- **A list that finishes loading and turns out empty is a change worth hearing** —
  `StatusBlock` carries `aria-live`.
- Announce with the element, not with an attribute bolted on: `Text as='h2'` gives a screen
  an outline and a dialog a title to point at.

## Every screen ships four ways

A change is not done until it holds in all four:

1. **Light and dark.** A token defined in one theme is a bug in the other.
2. **LTR and RTL.** Persian and Arabic ship; use logical properties throughout, and check
   that nothing mirrors that shouldn't (a horizontal rule has no handedness).
3. **Windows and Android.** Frameless title bar vs. transparent system bars and safe-area
   insets — `PageContainer` resolves this; don't hand-write the fork.
4. **Offline.** The app must open with no connection and no readable store. Nothing on the
   launch path may await a remote answer.

## Review checklist

- [ ] Composed from primitives — no hand-written card, flex div, z-index, or type pairing
- [ ] Every colour, radius, duration and size is a token (`no-unknown-classes` proves it)
- [ ] `npm run check` passes — contrast and `cn` gates
- [ ] Both themes, both directions, both platforms
- [ ] Keyboard: reachable, visible focus, Escape where a surface can be dismissed
- [ ] Touch targets ≥ 44px
- [ ] Empty, loading and error states exist and are announced
- [ ] Nothing moves on hover or press; state is in the fill
- [ ] Long values (a 42-char address, a 6-figure balance, a German or Persian label) don't
      break the row — truncate, wrap, or use the mono register deliberately
- [ ] `npm run lint` clean

## When a rule has to bend

Say why, in the comment above it. That is the house style: this codebase's comments record
decisions and the bugs that forced them, not what the code already says.
