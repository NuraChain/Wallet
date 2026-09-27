---
name: design-system
description: Use before writing or changing any JSX that renders UI in this repo — a screen, dialog, list, row, form, button, or piece of text. The catalog of primitives in src/ui, which one to reach for, and the two rules it is held to — no markup outside src/ui, and no className on anything in it. Read this before inventing a div.
---

# The design system

Every recurring surface in this app is a component. The house rule: **a call site composes
primitives; it does not re-describe a surface.** Almost every primitive here exists because
the same class string had been retyped ten to thirty times and had drifted. Retyping it an
eleventh time is the failure mode this catalog prevents.

**No markup outside `src/ui`.** A page or component renders primitives, never an HTML or SVG
tag of its own, and never `motion.*`, which renders one. When nothing in the catalog is the
element a screen needs, add a primitive here — named for what it is — rather than a `div` there.
`src/ui/usage.test.ts` fails on any lowercase JSX tag outside `src/ui`, in `src/` and
`src-extension/` alike.

**No primitive takes a `className`.** A primitive says what it is through named props, and
every value maps to one class written out in full in that component — Tailwind only generates
a class it finds in source, so none is ever assembled at runtime. How an element sits in its
parent is one shared set, `Placement` in `ui/place.ts`, taken by every primitive alike:
`grow`, `shrink`, `squeeze='x' | 'y'`, `mt` / `mb` / `ms` / `mx`, `self`,
`wide='hide' | 'only'` (the `lg` sidebar layout) and `width`.

`src/ui/ui.test.ts` enforces this one: a file in `src/ui` that declares a `className` or `…Class`
prop, or spreads HTML attributes without omitting `className`, fails the suite. When a
primitive nearly fits, give it the named prop or variant it lacks. A surface that is truly one
of a kind is a plain element at its call site, built from the shared strings in
`ui/token.ts` (`focusRing`, `tapArea`, `fieldSurface`, `selectedTint`) and `surfacePanel`.

## Typography — `ui/text.tsx`

`<Text variant as text />`, with a `plain` variant (no size, no colour) for a label inside a
control that sets both. Never write a raw `text-tiny text-txt-muted` on a div. Beyond the
variant: `size` (`small` | `large`), `scaleUp` (one step up at `sm`), `tone` (`normal` | `accent`
| `error` | `onPrimary`), `align`, `truncate`, `mono`, `weight`, `tabular`, `breaks` (`all` |
`words`), `pre`, `selectable`, `leading`, `srOnly`, `inset` (a recessed box of its own),
`maxWidth`, `pt` / `py`, and `Placement`.

| variant | Is |
|---|---|
| `caption` (default) | 12 / muted — the workhorse label |
| `captionStrong` | 12 / normal |
| `inherit` | 12, **no colour** — for a label inside a control whose fill decides the colour |
| `body` | 14 / normal |
| `bodyMuted` | 14 / muted |
| `title` | 16 semibold |
| `heading` | 18 semibold |
| `display` | 32 bold — the portfolio figure, and only that |

`as` picks the element and defaults to `div`. **Use it.** A visual heading and a semantic
one are the same object here: pass `as='h1'`/`'h2'` so screens have an outline and dialogs
have a title `aria-labelledby` can point at.

## Buttons — `ui/button.tsx`

`<Button variant size text label icon loading dim fullWidth selected current leftIcon rightIcon />` plus
`Placement`. **An icon button's glyph goes in `icon`, never as its child** — `usage.test.ts`
fails a `Button` whose only child is an icon. `label` is a label cut to one line where the row
squeezes the button; `text` wraps. `selected` tints the choice already in effect; `current` marks a button disabled
because it is the current choice rather than unavailable. **Every**
interactive control routes through this, including ones with a complete look of their own —
that is what `variant='bare'` is for (focus ring only, plus the `type='button'` default).

| variant | Use |
|---|---|
| `primary` | The action the user came for |
| `normal` | Raised neutral |
| `muted` | Quiet workhorse |
| `chip` | Hairline over the card tone — the account/network/settings row |
| `danger` | Muted fill, error ink — small remove controls inside a list |
| `destructive` | Filled red — an action that ends the session |
| `bare` | No fill, focus ring only |

The remaining variants are bare too — no fill and no built-in layout — each named for the one
control it draws: `plain`, `logo`, `row` / `rowTight` (a pressable list row), `listRow`,
`inlineRow` / `inlineSubtle` (`CopyButton`), `tab` / `tabOn`, `option` / `optionOn`,
`fieldSelect`, `fieldAction` (an icon inside a field), `tabClose`, `veil` (a reveal overlay)
and `window` (a title-bar control).

| size | Is |
|---|---|
| `small` | h-8 — section-header actions (Manage, Overview, Add) |
| `action` | h-11 — the standard control row |
| `actionFit` | h-11, sized to its label |
| `submit` | h-11 full width — a dialog's primary submit |
| `cta` / `ctaWide` | A page's one submit: full width on a phone, its own width from `sm` |
| `icon` / `iconChip` / `iconChipSmall` / `iconLarge` | 32 / 36 / 32 / 40px squares, all carrying `tap-44` |
| `selector` | The wallet header's account and network chips |
| `tile` | The wallet's send / receive / redeem tiles |
| `segment` | One choice in a row of filter segments |
| `menu` | A `MenuRow` |
| `emoji`, `entry`, `picker`, `siteRow`, `siteCard`, `siteAdd` | The emoji grid, the intro's two entries, its language picker, and the browser start page's rows and cards |
| `none` | No dimensions: a bare variant supplies its own |

`loading` shows the spinner **and** disables the button — a busy control must not fire
twice. `dim` is the opt-in disabled fade: `disabled` means "not available yet" on an action
button, and "this is the one you're already on" in the language and network pickers, where
fading is wrong.

## Icons — `lucide-react`

The only icon source in the tree. `import { Check, Trash } from 'lucide-react'`.

- **Always pass `size`.** Lucide defaults to 24, which is wrong almost everywhere here. The
  steps in use are 14/16/18 inline and in rows, 20–24 for a dialog close, 28+ only for the
  art in a status screen.
- **Never pass `color`.** The icon strokes `currentColor`, so it inherits the surrounding
  `text-*` — which is how one `isActive ? 'text-txt-normal' : 'text-txt-muted'` on a parent
  colours the icon and its label together.
- **A map that holds an icon holds the component, not an element**, typed `LucideIcon`:
  `{ key: string; icon: LucideIcon }[]`, rendered `<item.icon size={16} />`.
- `Button` takes `leftIcon` / `rightIcon`; do not hand-place an icon beside a label.
- Lucide is a fork of Feather, so Feather names mostly carry over — but use the **v1
  canonical** name, not the deprecated alias it still resolves: `Trash` not `Trash2`,
  `House` not `Home`, `PanelLeft` not `Sidebar`, `TriangleAlert` not `AlertTriangle`,
  `CircleQuestionMark` not `HelpCircle`, `Pen` / `PenLine` not `Edit2` / `Edit3`.

## Surfaces

- **`surfacePanel`** (`ui/panel.tsx`) — the card *material* string: `border border-line
  bg-base-2`. Wear it on anything that isn't a plain div (a `motion` element, a `Button`).
- **`Panel`** — that material plus a card's box (`rounded-surface p-4`).
- **`ListCard`** (`ui/list.tsx`) — **the default for any homogeneous list.** One card around
  the whole group with `list-divide` hairlines between rows, not a card per row. Rows are
  direct children and stay plain. Anything that is not a row — an empty state, an action —
  goes *outside* the group, because a divider into whitespace is a lie about structure.
- **`IconBox`** (`ui/iconbox.tsx`) — the small filled square leading a row. `tone`:
  `muted` | `primary` | `secondary` | `badge`; `size` 5 / 7 / 8 / 9 (default 8); `glyph` sizes the
  letter or emoji standing in for an icon.
- **`Panel`** also takes `flow='row' | 'column'`, `gap`, `align`, `textAlign`, and `bounded` (a
  short scrolling box). **`ListCard`** takes `flush` for the body of a full-screen dialog.
- **`ChoiceRow`** (`ui/choice.tsx`) — a row in a list of choices, tinted when it is the one in
  effect, with its own controls inside it.

## Layout

- **`Horizontal` / `Vertical`** (`ui/stack.tsx`) — a `flex` row and a `flex flex-col`
  column. Use them instead of `<div className='flex'>`. They take `gap`, `align`, `justify`,
  `p` / `px` / `py` / `pt` / `pb`, `relative`, `fill` (`both` | `height`), `maxWidth`, `scroll`,
  `even` (children share the row equally), `textAlign`, and `Placement` — only the steps in use,
  so a new one is added to the map, not typed at the call site.
- **`Block`** (`ui/wrap.tsx`) — a plain `div` for a wrapper that only has to sit in its parent,
  hold a `ref` or carry a role: `Placement`, `relative`, `fill`, `clip`, `height`. It stops there;
  a box that wants a look is a primitive named for that look. **`Grid`** (`look='emoji' |
  'favorites' | 'recent'`) and **`Rail`** live beside it.
- **`Screen`** (`enter='fade' | 'grow'`, `backdrop`), **`EntryCard`**, **`Track`** (the dashboard's
  tabs side by side), **`SidebarPanel`**, **`Splash`**, **`IntroBar`** and **`IntroSlide`**
  (`ui/screen.tsx`) — the scaffolding a route is built from.
- **`Toolbar`** (`ui/toolbar.tsx`) — the strip of controls across the top of the browser.
- **`TabBar` / `Tab`** (`ui/tabs.tsx`) — underlined tabs, with room at the end for an action;
  **`TabChip`** is one tab in the browser's tab list.
- **`SectionHeader`** (`ui/section.tsx`) — muted title with an optional trailing control.
- **`PageContainer`** (`ui/container.tsx`) — `variant='tab' | 'browser' | 'intro'`.
  Every top-level surface gets its top padding from here. It resolves the
  `Windows title bar : Android safe area` fork for you; **never hand-write that formula.**
- **`layer`** (`ui/container.tsx`) — `base` z-10, `chrome` z-20, `popover` z-30, `dialog` z-40,
  `mouse` z-100.
  **Never write a bare `z-*`.** Three unnamed numbers are how the language picker once
  rendered *under* the nav bar it had to cover, with the tabs still clickable through its
  own scrim.
- **`inset`** — safe-area formulas for surfaces that pad against device insets without
  being a page: `sheetTop`, `modalFrame`, `tabTop` (a `windows`/`device` pair),
  `tabBottom`, `edgeBottom`.
- **`ScrollArea`** (`ui/scroll.tsx`, `fill`) — scrolling region with an overlay thumb that takes
  no layout width, plus pull-to-refresh. **`ScrollBar`** (`ui/scrollbar.tsx`) is that thumb
  on its own, for a region that scrolls without being a page — it takes a `viewportRef`.

## Dialogs — `ui/modal.tsx`, `ui/sheet.tsx`, `ui/dialog.ts`

**A floating div is not a dialog.** Thirteen of them here once rendered with no role, no
name, no focus trap and no Escape — including the one that approves a transaction.

- **`Modal`** + `ModalHeader` / `ModalBody` / `ModalActions` — the centred dialog.
  Props are `onClose`, `scroll` (cap against the viewport and hang a `ScrollBar` beside the
  panel), `scale` (the enter/exit scale, default `0.9`), `width`, `padding='none'`, `gap={2}` and
  `align='center'`. **`width` is a step, not a class** — `panel` (320 → 384 → 448 as the window
  grows), `narrow`, `full`; a dialog frozen at 320px is what forced addresses to be truncated in
  the first place. `ModalHeader` takes `truncate`, `titleSize`, `titleGrow` and `width`;
  `ModalBody` takes `gap`, `mt` and `short`; `ModalActions` takes `flush`.
  `ModalHeader` also takes `close='none'`, for a step that must not be abandoned halfway. Wrapping the
  growing part in `ModalBody` is what holds the header and footer still. `ModalHeader` takes
  `close='icon' | 'chip'`, a `leading` slot, and claims the title id from context.
- **`Sheet`** + `SheetHeader` — the sheet that drops from the top (intro flows).
- **`Popover`** (`ui/popover.tsx`) — opens *within* a page and must not escape it. It uses
  `useDismiss` only: Escape and focus return, but **no** focus trap. A dropdown the keyboard
  cannot leave is a dropdown that has captured the page.
- **`useDialog(onClose)`** returns `{ panelRef, titleId }` and supplies the four things that
  make a dialog one: a name, focus in and back out again, Tab cycling inside the panel, and
  Escape closing the **topmost** dialog only (they stack — Settings opens Language).

Put `titleId` on the title; `ModalHeader` claims it from context automatically.

## Forms — `ui/field.tsx`

`TextField`, `PasswordField`, `TextArea`, `ReadonlyField`; the `fieldSurface` string lives in
`ui/token.ts`. They take `onValue: (value: string) => void` rather than an event, plus `label`,
`error`, `size`, and `leading`/`trailing` slots. `TextField` adds `room` (text clear of a leading
icon, or of both edges), `mono`, `align`, `textSize` and `truncate`; `TextArea` adds `tall` and
`breaks`. `Checkbox` (`ui/checkbox.tsx`) takes
`checked` + `onToggle`.

## Feedback

- **`Alert`** (`ui/alert.tsx`) — `variant`: `error` | `warning` | `success`;
  `size`: `compact` (dialogs) | `comfortable` (intro) | `dense` | `banner`, plus `textAlign`,
  `mono` and `Placement`. **An empty message renders nothing**,
  so drop the `message.length > 0 &&` guard at the call site.
- **`StatusBlock`** (`ui/state.tsx`) — `state`: `empty` | `loading`, with `aria-live`. What a
  list shows when it has nothing to show yet or nothing at all.
- **`Live`** (`ui/live.tsx`) — an `sr-only` announcement slot that is **always mounted**, so a
  message is announced when it changes rather than never. `Alert` already carries one; reach for
  it directly when feedback lands somewhere other than an alert. It is absolutely positioned, so
  it never adds a flex gap.
- **`ProgressBar`** (`look='strip' | 'track'`), **`Spinner`** (`muted`), **`FailureScreen`**,
  **`MenuRow`** (`selected`, `Placement`), **`ScrollBar`** (`edge`), and **`Popover`**
  (`anchor='below' | 'corner'`, `look='list' | 'note'`, with `PopoverAnchor` around its trigger).
  `StatusBlock` takes `fill` and `px`; `LoadStrip` is the browser's page-load strip.
- **`Slider`**, **`Logo`**, **`Flag`**, **`QrFrame`** (`ui/media.tsx`), **`FieldLead`** (the glyph over a
  field's leading edge), and the recovery phrase's **`SecretKey` / `SecretWords` / `SecretWord`**
  (`ui/secret.tsx`), which stay blurred until revealed.
- **`Mouse`** (`ui/mouse.tsx`) — the floating logo, one element in the page's `#mouse`.

## Money and destruction

Three primitives exist because getting these wrong costs the user something real.

- **`AddressBlock`** (`ui/address.tsx`) — a full address, mono, wrapped, selectable.
  **`shortAddress` is for a row being scanned; anything a user must verify before confirming gets
  this instead.** A poisoning contract is chosen to match the first and last characters a
  truncation keeps.
- **`ConfirmPanel` / `ConfirmDialog`** (`ui/confirm.tsx`) — the gate in front of a delete. Use
  `ConfirmPanel` inside a screen that is already a dialog and swaps its body (the accounts,
  networks and tokens lists all do); `ConfirmDialog` where there is no dialog yet. Dialogs do not
  nest — an inner `Modal` is trapped inside the outer panel's transform.
- **`CopyButton`** (`ui/copy.tsx`) — copy with the result on the control itself, plus a `Live`
  announcement. Never report a copy with an `Alert` under the button: it appears after the fact
  and grows the surface out from under the finger already reaching for the next action.

## Before you write a div, check

1. Am I outside `src/ui`? Then no tag at all — find the primitive, or add one in `src/ui`.
   Is it text? → `Text`. Is it pressable? → `Button`. Is it a card? → `Panel` /
   `surfacePanel`. A list? → `ListCard`. A flex box? → `Horizontal` / `Vertical`. An icon?
   → `lucide-react` with an explicit `size`. An address to verify? → `AddressBlock`.
2. Is it a dialog? → `Modal` or `Sheet`, never a hand-rolled overlay.
3. Am I about to write a bare `z-*`, a safe-area `calc()`, a `text-tiny text-txt-muted`, or
   `border border-line bg-base-2`? All four already have a name.
4. Does the primitive nearly fit? Add the named prop or variant it lacks — there is no
   `className` to pass, and the test in `src/ui` keeps it that way. Fork nothing.
5. Does a new recurring shape deserve its own primitive? If the same class string is about
   to exist in three places, yes — and document *why* in the JSDoc, the way the rest do.
