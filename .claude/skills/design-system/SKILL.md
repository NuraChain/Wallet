---
name: design-system
description: Use before writing or changing any JSX that renders UI in this repo — a screen, dialog, list, row, form, button, or piece of text. The catalog of primitives in src/components/ui and src/layout, which one to reach for, and the rule that call sites compose primitives instead of hand-writing surfaces. Read this before inventing a div.
---

# The design system

Every recurring surface in this app is a component. The house rule: **a call site composes
primitives; it does not re-describe a surface.** Almost every primitive here exists because
the same class string had been retyped ten to thirty times and had drifted. Retyping it an
eleventh time is the failure mode this catalog prevents.

All of them take `className` and merge it through `cn`, so a caller's conflicting utility
wins over the component's default. Override that way rather than forking a component.

## Typography — `ui/text.tsx`

`<Text variant text as className />`. Never write a raw `text-tiny text-txt-muted` on a div.

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

`<Button variant size text loading dim fullWidth leftIcon rightIcon />`. **Every**
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
| `bare` | No fill; nav tabs, window controls, inline icon toggles |

| size | Is |
|---|---|
| `small` | h-8 — section-header actions (Manage, Overview, Add) |
| `action` | h-11 — the standard control row |
| `submit` | h-11 full width — every primary submit, on every screen |
| `icon` / `iconChip` / `iconLarge` | 32 / 36 / 40px squares, all carrying `tap-44` |
| `none` | Dimensions supplied by the caller |

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
  `muted` | `primary` | `secondary` | `badge`. Size rides in through `className`
  (default `size-8`).

## Layout

- **`Horizontal` / `Vertical`** (`ui/stack.tsx`) — a `flex` row and a `flex flex-col`
  column. Use them instead of `<div className='flex'>`; everything else (gap, alignment,
  padding) rides in through `className`.
- **`SectionHeader`** (`ui/section.tsx`) — muted title with an optional trailing control.
- **`PageContainer`** (`layout/container.tsx`) — `variant='tab' | 'browser' | 'intro'`.
  Every top-level surface gets its top padding from here. It resolves the
  `Windows title bar : Android safe area` fork for you; **never hand-write that formula.**
- **`layer`** (`layout/container.tsx`) — `base` z-10, `chrome` z-20, `popover` z-30, `dialog` z-40.
  **Never write a bare `z-*`.** Three unnamed numbers are how the language picker once
  rendered *under* the nav bar it had to cover, with the tabs still clickable through its
  own scrim.
- **`inset`** — safe-area formulas for surfaces that pad against device insets without
  being a page: `sheetTop`, `modalFrame`, `tabTop` (a `windows`/`device` pair),
  `tabBottom` (clears the floating nav, and stops clearing it at `lg`), `edgeBottom`.
- **`ScrollArea`** (`layout/scroll.tsx`) — scrolling region with an overlay thumb that takes
  no layout width, plus pull-to-refresh. **`ScrollBar`** (`ui/scrollbar.tsx`) is that thumb
  on its own, for a region that scrolls without being a page — it takes a `viewportRef`.

## Dialogs — `ui/modal.tsx`, `ui/sheet.tsx`, `ui/dialog.ts`

**A floating div is not a dialog.** Thirteen of them here once rendered with no role, no
name, no focus trap and no Escape — including the one that approves a transaction.

- **`Modal`** + `ModalHeader` / `ModalBody` / `ModalActions` — the centred dialog.
  Props are `onClose`, `scroll` (cap against the viewport and hang a `ScrollBar` beside the
  panel), `scale` (the enter/exit scale, default `0.9`), `width` and `panelClass`.
  **`width` is a step, not a class** — `panel` (320 → 384 → 448 as the window grows), `narrow`,
  `full`. Never pass a width through `panelClass`: it cannot out-specify the breakpoints here,
  and a dialog frozen at 320px is what forced addresses to be truncated in the first place.
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

`TextField`, `PasswordField`, `TextArea`, `ReadonlyField`, plus the `fieldSurface` string.
They take `onValue: (value: string) => void` rather than an event, plus `label`, `error`,
`size`, and `leading`/`trailing` slots. `Checkbox` (`ui/checkbox.tsx`) takes
`checked` + `onToggle`.

## Feedback

- **`Alert`** (`ui/alert.tsx`) — `variant`: `error` | `warning` | `success`;
  `size`: `compact` (dialogs) | `comfortable` (intro). **An empty message renders nothing**,
  so drop the `message.length > 0 &&` guard at the call site.
- **`StatusBlock`** (`ui/state.tsx`) — `state`: `empty` | `loading`, with `aria-live`. What a
  list shows when it has nothing to show yet or nothing at all.
- **`Live`** (`ui/live.tsx`) — an `sr-only` announcement slot that is **always mounted**, so a
  message is announced when it changes rather than never. `Alert` already carries one; reach for
  it directly when feedback lands somewhere other than an alert. It is absolutely positioned, so
  it never adds a flex gap.
- **`ProgressBar`**, **`Spinner`**, **`FailureScreen`**, **`MenuRow`** (+ `selectedTint`).

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

1. Is it text? → `Text`. Is it pressable? → `Button`. Is it a card? → `Panel` /
   `surfacePanel`. A list? → `ListCard`. A flex box? → `Horizontal` / `Vertical`. An icon?
   → `lucide-react` with an explicit `size`. An address to verify? → `AddressBlock`.
2. Is it a dialog? → `Modal` or `Sheet`, never a hand-rolled overlay.
3. Am I about to write a bare `z-*`, a safe-area `calc()`, a `text-tiny text-txt-muted`, or
   `border border-line bg-base-2`? All four already have a name.
4. Does the primitive nearly fit? Pass `className` — `cn` lets it win. Fork nothing.
5. Does a new recurring shape deserve its own primitive? If the same class string is about
   to exist in three places, yes — and document *why* in the JSDoc, the way the rest do.
