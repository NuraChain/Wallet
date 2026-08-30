---
name: motion-swiper
description: Use when writing, changing, or reviewing anything that moves — a dialog that enters or leaves, a page transition, a draggable list, a carousel — or any file importing `motion/react` or `swiper`. Which of the two owns a given effect, the props this repo actually uses, and the RTL and reduced-motion rules both have to clear.
---

# Motion and Swiper

Two animation dependencies, `motion` 12 and `swiper` 14, with almost no overlap.
**Motion animates something entering, leaving, or being dragged. Swiper is the intro
slide deck and nothing else.** Everything that merely changes state in place — a hover
fill, a colour, a chevron rotating — is a Tailwind transition and neither library
touches it.

Before reaching for either, check the rung above it: a CSS transition on a class, then
`transition-[…] duration-(--duration-fast)` as `ui/button.tsx` writes it, then
scroll-snap for a horizontal row (that is how the browser tab strip works, not Swiper).
Motion is what you use where CSS has nothing — an element that is not in the DOM before
or after the animation.

## Motion

### The import

`import { motion, AnimatePresence } from 'motion/react'` — always. `framer-motion` is in
`node_modules` as a transitive dependency of `motion`; importing from it directly gets a
second copy of the runtime and its own `AnimatePresence` context, so exits stop firing.

### Animate transforms and opacity

`x`, `y`, `scale`, `rotate`, `opacity`. These are composited and cost nothing per frame.
Animating `width`, `height`, `top`, `margin` or anything else that reflows is how a
transition starts dropping frames on a phone.

The one exception in the tree is `ui/progress.tsx`, which animates `insetInlineStart` for
its indeterminate bar because the track has to run right-to-left in Farsi and Arabic and
`x` has no logical counterpart. That is the reason it is allowed there. Do not copy the
shape somewhere it is not needed.

### `AnimatePresence`

Exit animations only run when both hold:

- The removed element is a **direct child** of `AnimatePresence`, or lives inside one.
- That child has a **stable `key`**.

`page/dashboard.tsx` spells this out: `{modal === 'language' && <IntroLanguage key='language' … />}`.
The key is not decoration — swapping one modal for another without it makes React reuse
the node, and neither dialog animates.

| Prop | When |
|---|---|
| *(default)* | Two unrelated things, the leaver and the arriver can overlap |
| `mode='wait'` | One value replacing another in the same slot — the copy icon in `dashboard.wallet.tsx` |
| `initial={false}` | The content is already on screen at mount and must not animate in on first paint |

### `transition`

`type: 'tween'` is the house default. A spring on chrome — a nav bar, a dialog — reads as
bounce, and this interface does not bounce. Durations are seconds here while the CSS
tokens are milliseconds (`--duration-fast: 150ms`, `--duration-base: 200ms`,
`--duration-surface: 300ms`); keep a JS duration in the same range rather than inventing a
third scale.

### Reduced motion

`src/assets/style.css` flattens every CSS animation and transition under
`prefers-reduced-motion: reduce`. **It does not reach Motion**, which drives its own
values in JS. Anything that loops, auto-advances, or moves a large surface has to ask:

```tsx
const reduced = useReducedMotion(); // from 'motion/react'
```

and drop to an opacity change or nothing at all. A one-shot fade of a dialog is fine
either way; a repeating animation is not.

### `Reorder`

The apps list is the only drag surface. Three things make it work and all three are load-bearing:

- `as='div'` — `Reorder.Item` renders an `li` by default and the list here is not a `ul`.
- `dragListener={false}` + `useDragControls()` — the row holds buttons. A row that listens
  for its own drag swallows their clicks; only the grip calls `controls.start(event)`.
- `touch-none` on the grip — without it the browser claims the gesture and scrolls the page.

## Swiper

One instance exists, in `page/intro.tsx`. Read it before adding a second, and prefer not
to add a second.

### Both halves are required

```tsx
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
```

A feature prop with no module in `modules={[…]}` is **silently dead** — no error, the
option is simply ignored. And every module needs its stylesheet next to `swiper/css`, or
its elements render unstyled on top of the slides.

### RTL

Swiper reads its direction once, at init. Passing `dir={getDirection()}` is half the fix;
the other half is `key={getLanguage().code}` on the `<Swiper>`, which remounts it when the
user changes language. Drop the key and the deck keeps sliding the old way.

### Options this repo settled on

| Option | Why |
|---|---|
| `autoplay={reduced ? false : { … }}` | The CSS reduced-motion block cannot stop it; the prop has to |
| `disableOnInteraction: false` | A swipe should not permanently kill the rotation |
| `pauseOnMouseEnter: true` | Reading a slide should not race a timer |
| `pagination={{ clickable: true }}` | The dots are a control, not a readout |
| `onSwiper` into a ref | The way to hold the instance — never query its DOM |

### Slides

`SwiperSlide` children need a stable `key`. If a deck ever grows past a few dozen slides,
that is when `virtual` and `virtualIndex` become the answer — not before.

## Checklist

- [ ] Could a Tailwind transition or scroll-snap have done this? Then it should have.
- [ ] Imported from `motion/react`, not `framer-motion`.
- [ ] Only transforms and opacity animate, or there is a stated reason like `progress.tsx`.
- [ ] Every `AnimatePresence` child has a stable `key`; `mode`/`initial` chosen deliberately.
- [ ] Looping or auto-advancing motion is gated on `useReducedMotion()`.
- [ ] Swiper: every feature prop has its module **and** its stylesheet.
- [ ] Swiper: `dir` passed and keyed on the language so RTL survives a switch.
