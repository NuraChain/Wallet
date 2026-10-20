---
name: motion-swiper
description: Use when writing, changing, or reviewing anything that moves — a dialog that enters or leaves, a page transition, a draggable list, a carousel — or any file importing `motion/react` or `swiper`. Which of the two owns a given effect, the props this repo actually uses, and the RTL and reduced-motion rules both have to clear.
---

# Motion and Swiper

Two animation dependencies, `motion` 13 and `swiper` 14, with almost no overlap.
**Motion animates something entering, leaving, or being dragged. Swiper is the intro
slide deck and nothing else.** Everything that merely changes state in place — a hover
fill, a colour, a chevron rotating — is a Tailwind transition and neither library
touches it.

Before reaching for either, check the rung above it: a CSS transition on a class, then
`transition-[…] duration-(--duration-fast)` as `ui/button.tsx` writes it, then
scroll-snap for a horizontal row. Motion is what you use where CSS has nothing — an element
that is not in the DOM before or after the animation.

## Motion

### The import

`import { motion, AnimatePresence } from 'motion/react'` — always. `framer-motion` is in
`node_modules` as a transitive dependency of `motion`; importing from it directly gets a
second copy of the runtime and its own `AnimatePresence` context, so exits stop firing.

### Animate `transform` and `opacity`

Those two, and `transform` written whole: `transform: 'scale(0.9)'`, never Motion's separate
`x`, `y`, `scale` or `rotate`. Motion hands `transform` and `opacity` to the browser, which runs
them off the main thread. Its separate transform values it works out itself, in script, frame by
frame, and that clock is the one iOS is hard on: WebKit drops it to 30 a second in Low Power
Mode, and it stalls while the content of the dialog being opened mounts. Every animation in
`src/ui` was moved off it for that reason. Animating `width`, `height`, `top`, `margin` or
anything else that reflows is worse again.

Writing the transform whole has three consequences, and `ui/modal.tsx` shows all of them:

- **One form per element.** `transform` beside a separate `scale` or `y` on the same element is
  two writers for one property.
- **A surface that holds content goes back to `none`**:
  `animate={{ transform: 'scale(1)', transitionEnd: { transform: 'none' } }}`. A transform left
  on it, even one that changes nothing, makes it the box its `fixed` descendants are measured
  against, and `Popover`'s backdrop is one — it would cover the dialog instead of the window. A
  leaf with nothing inside it (the copy glyph, the waiting bar) can keep its last keyframe.
- **An exit from `none` names its start**: `exit={{ transform: ['scale(1)', 'scale(0.9)'] }}`.
  Motion cannot animate from `none`; it fills it in from the target with every number zeroed,
  which for a scale is a panel that leaves from nothing.

Three or more keyframes under a single `ease` are eased as one curve by the browser, where
Motion's own engine eased each step. Pass an ease per step to keep the stepped curve, as
`ui/copy.tsx` does for its tick.

A transform has no logical direction, and that is not a reason to animate layout instead.
`ui/progress.tsx` fills its waiting bar with `scaleX(…)` and lets the origin carry the direction —
`origin-left rtl:origin-right` — so it runs right-to-left in Farsi and Arabic without reflowing
anything. Nothing in the tree animates a property that reflows.

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
| `mode='wait'` | One value replacing another where the two must never be seen together; the copy glyph overlaps instead, both absolutely placed |
| `initial={false}` | The content is already on screen at mount and must not animate in on first paint |

### `transition`

Every value comes from `ui/motion.ts`: one token per role, never a duration or spring typed
where it is used. A dialog tips upright out of a light blur on `spring.dialog`, which is
critically damped, so it settles without bouncing, and fades ahead of it on
`transition.dialogFade`. A sheet slides on `transition.sheet`. Both leave on
`transition.dismiss` over a scrim on `transition.overlay`. A glyph swap is `transition.swap`
out of `blur.icon`, and a screen rises on `spring.entrance`. A surface's `filter` goes back to
`none` with its transform, and an exit names its start for both.

CSS takes the same values from `style.css`: the press (`press`, `press-row`), the dashboard's tab
track (`--ease-slide`) and `ease-out`. The CSS durations are otherwise `--duration-fast: 150ms`,
`--duration-base: 200ms` and `--duration-surface: 300ms`.

### Reduced motion

`src/assets/style.css` flattens every CSS animation and transition under
`prefers-reduced-motion: reduce`. **It does not reach Motion**, which drives its own
values in JS. Anything that loops, auto-advances, or moves a large surface has to ask:

```tsx
const reduced = useReducedMotion(); // from 'motion/react'
```

and drop to an opacity change or nothing at all. A one-shot fade of a dialog is fine
either way; a repeating animation is not. Motion does not skip a whole `transform` string,
so each one here starts from its resting value when `reduced` is true, and the fade and blur
beside it stay.

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
- [ ] Only `transform`, written whole, and `opacity` animate; a surface ends on `transform: 'none'`.
- [ ] Every `AnimatePresence` child has a stable `key`; `mode`/`initial` chosen deliberately.
- [ ] Looping or auto-advancing motion is gated on `useReducedMotion()`.
- [ ] Swiper: every feature prop has its module **and** its stylesheet.
- [ ] Swiper: `dir` passed and keyed on the language so RTL survives a switch.
