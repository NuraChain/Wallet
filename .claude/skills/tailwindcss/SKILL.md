---
name: tailwindcss
description: Use whenever you write, change, or review a Tailwind class, or touch src/assets/style.css. Covers the Tailwind v4 CSS-first theme and its exact token names, the custom cn() merge and how it groups utilities, the custom utilities, RTL-safe logical properties, and the two build gates (no-unknown-classes, contrast) that reject anything off-token.
---

# Tailwind in this repo

Tailwind v4 through `@tailwindcss/vite`. **There is no `tailwind.config.js`** — the theme is
CSS-first and lives entirely in `src/assets/style.css`, which is also the `entryPoint` the
lint plugin reads.

## The one hard rule

`better-tailwindcss/no-unknown-classes` is set to **error**. A class that is not in the
theme is a build failure, not a value that quietly works. That means:

- **No stock palette.** `bg-gray-100`, `text-slate-500`, `border-zinc-200` do not exist here.
- **No stock radius or shadow steps.** No `rounded-lg`, no `shadow-md`.
- **No arbitrary colour.** `bg-[#fff]` defeats the theme switch and the contrast gate.

Everything below is the complete vocabulary. If what you need is not here, add a token (see
*Adding a token*) — don't reach outside.

## Tokens

**Surfaces and lines** — `base-1` (page), `base-2` (card), `base-3` (quiet fill),
`line` (decorative hairline), `scrim`, `scrollbar`, `scrollbar-hover`, `focus-ring`,
`badge` / `badge-line` / `badge-text`.

**Fills** — `btn-muted`, `btn-normal`, `btn-primary`, `btn-danger`, each with `-hover`,
`-active`, `-border`; plus flat `btn-secondary`.

**Fields** — `input-bg`, `input-normal` (the 3:1 control boundary), `input-error`.

**Ink** — `txt-normal`, `txt-muted`, `txt-reverse`, `txt-error`, `txt-success`.

Used as any Tailwind colour utility: `bg-base-2`, `text-txt-muted`, `border-line`.

**Type** — `text-tiny` 12, `text-small` 14, `text-medium` 16, `text-large` 18,
`text-display` 32 (the only step that pins its own leading and tracking).

**Radius** — `rounded-control` 6px (chips, small squares, favicons), `rounded-surface` 10px
(cards, rows, fields, action buttons), `rounded-dialog` 14px (what floats). `rounded-full`
stays a bare utility — a pill is the absence of a step on the ramp, not a step on it.

**Elevation** — `shadow-float`, and nothing else. Cards and rows cast no shadow; separation
is a fill step plus a hairline. Only a dialog or a sheet floats.

**Duration** — Tailwind has no `duration` theme namespace, so these are plain custom
properties on `:root`, reached through the shorthand:
`duration-(--duration-fast)` 150ms, `duration-(--duration-base)` 200ms,
`duration-(--duration-surface)` 300ms.

Two themes, `[data-theme='light']` and `[data-theme='dark']`, swap the whole palette. Colour
tokens are declared `@theme inline` so the generated utilities point at the runtime
variables rather than baking a value in.

## Custom utilities

- `tap-44` — grows a control's hit area to the 44px platform minimum via a centred
  pseudo-element, changing nothing that is drawn. Every icon button wears it.
- `scroll-hidden` — opts out of the native scrollbar; used by `ScrollArea` and the tab strip.
- `list-divide` — hairlines between a container's children (`& > * + *`, block-start
  border, so RTL needs no mirror). This is how grouped lists get their rhythm.

## `cn` — the class merge

`src/utility/cn.ts`. **Always** compose classes through it; never concatenate strings into a
`className`. Browser precedence is decided by the order Tailwind wrote the stylesheet, not
by attribute order — so without the merge a component's default can silently beat the
caller's override. `cn` drops the losers so "last one wins" is actually true.

It handles `clsx`-style shapes (`cond && 'class'`, arrays, records) plus Tailwind conflict
resolution. Things worth knowing before you touch it:

- **`text-` spells two properties.** `text-tiny` is a size, `text-txt-error` a colour, and
  they must not displace each other. Arbitrary lengths (`text-[0.5rem]`) count as sizes.
- **`border`/`outline`/`ring` group only their colour slot.** The bare `border` is the only
  thing restoring a width after preflight's `0 solid`; grouping the whole prefix renders
  every bordered surface at zero width, and costs `outline-2 outline-offset-2
  outline-double` its meaning so every focus ring goes invisible. Both shipped once.
- **`flex` is deliberately ungrouped** — `flex` is a display, `flex-col` a direction, so
  `cn('flex flex-col')` must keep both.
- Variants are part of the key, so `hover:opacity-50` never displaces `opacity-100`.

**If you change `cn`, add a case to `script/cn.check.ts`.** It runs in `npm run check`,
which runs in `npm run build`. Cases assert which classes *survive*, not the output string,
because lint rewrites class literals into canonical order.

## Adding a token

1. Declare the variable in **both** `[data-theme]` blocks — a token that exists in one
   theme is a bug that only shows in the theme nobody had open.
2. Map it in `@theme inline` (`--color-x: var(--x);`) so a utility is generated.
3. Run `npm run check`. `script/contrast.js` parses the stylesheet itself and asserts body
   text ≥ 4.5:1 on every surface, reversed labels ≥ 4.5:1 on every fill *including its hover
   and active steps*, control boundaries and the focus ring ≥ 3:1. It exits non-zero listing
   every failing pair.
4. Colours are authored in `oklch()`. The parser reads `oklch(L% C H)` — keep that form.

## Writing classes

- **Single-line class literals only.** `enforce-consistent-line-wrapping` is off precisely
  because every literal in the tree is one line, and `cn`'s merge splits on a single space.
- **Logical properties for anything with handedness.** The app ships Persian and Arabic, so
  use `ps`/`pe`, `ms`/`me`, `inset-s`/`inset-e`, `rounded-s`/`rounded-e`,
  `text-start`/`text-end` — not `pl`/`pr`/`left`/`right`. `cn` groups the logical and
  physical families separately, mirroring how Tailwind orders them.
- **Transition only what changes.** `transition-[background-color,border-color]`, never
  `transition-all` — a blanket transition drags layout properties into every hover.
- Classes reached dynamically must exist as whole literals somewhere Tailwind's scanner can
  see them (see `inset` and `layer` in `layout/container.tsx`) — never build a class name by
  interpolation.

## What can't be a utility

`style.css` also holds what no React element owns: the `#root` frame (`100dvh`, because
Android's keyboard shrinks the visual viewport but not `vh`), the global
`prefers-reduced-motion` collapse, the `user-select` reset and its `input`/`textarea`
exemption (WebKitGTK honours the inherited `none` literally and made Linux fields
untypeable), the font stack per language, and Swiper's own pagination markup. Read the
comment above a block before changing it — each one records a bug that shipped.
