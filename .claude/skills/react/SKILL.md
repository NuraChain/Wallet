---
name: react
description: Use when writing, reviewing, or refactoring any React/TypeScript in this repo — components, hooks, state, effects, routing, or anything under src/. Covers React 19 idioms, the module-singleton + useSyncExternalStore state convention, react-router memory routing with loaders, the file/naming layout, and the maximal ESLint config that will otherwise fail the build.
---

# React in this repo

React 19.2 + TypeScript 6 + Vite 8, rendered into a Tauri WebView. No test runner, no
state library, no CSS-in-JS. `npm run build` runs `tsc`, then `npm run check`, then Vite —
a type error or a failing check is a failed build.

## Where code goes

| Directory | Holds | Naming |
|---|---|---|
| `src/page/` | Route-level screens | `dashboard.tsx` |
| `src/layout/` | Shell: root, containers, error boundary, scroll, titlebar | `container.tsx` |
| `src/components/ui/` | Design-system primitives (see the `design-system` skill) | `button.tsx` |
| `src/components/dashboard/` | Screen-specific composites | `dashboard.tokens.tsx` |
| `src/core/` | Domain logic: wallet, vault, network, dapp, caches | `network.provider.ts` |
| `src/hook/` | React bindings over `core`/`utility` singletons | `balance.ts` |
| `src/utility/` | Framework-free helpers: `cn`, `format`, `storage`, `language`, `theme`, `event` | `format.ts` |

Filenames are lowercase, dot-separated, never PascalCase. Nothing in `utility/` may import
React; nothing in `core/` may import a component.

## Component shape

Every component in the tree follows one shape. Copy it rather than inventing:

```tsx
import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utility/cn';

/**
 * Thing - One line saying what it is.
 *
 * A paragraph saying *why* it exists — what it replaced, what breaks without it. This repo
 * documents decisions, not mechanics; a comment restating the code is noise.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes; conflicting utilities override the recipe's.
 * @param {ReactNode} props.children The content.
 * @returns {JSX.Element} The thing.
 */
export default function Thing({ className = '', children, ...rest }: { className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>)
{
    return (
        <div className={ cn('flex items-center', className) } { ...rest }>

            { children }

        </div>
    );
}
```

Rules that shape falls out of:

- **Props are an inline type literal**, intersected with the DOM attributes the element
  accepts, with `className`/`children` `Omit`-ed so ours win. No separate `interface Props`.
- **`className` always merges through `cn`**, never string concatenation — a caller's
  override must beat the component's default. See the `tailwindcss` skill.
- **One default export per component file**; multi-component modules (`stack.tsx`,
  `field.tsx`, `modal.tsx`) use named exports.
- **JSDoc with `@param`/`@returns` on every exported function.** The lint config requires it.
- Blank line after the opening tag and before the closing tag of a component's root JSX.
- A component whose entire content is one string takes a `text` prop and self-closes;
  `children` stays for the composing cases. Both render into the same slot — see
  `Button`, `Text`, `Alert`, `Checkbox`.

## State

**There is no global React state.** No Context for data, no reducer, no store library.
The pattern is a module singleton in `core/` or `utility/`, plus a hook in `hook/` that
subscribes React to it:

```ts
export const useLanguage = (): LanguageType => useSyncExternalStore(subscribeLanguage, getLanguageCode);
```

- `useSyncExternalStore`, not `useEffect` + a counter: the module already holds the
  snapshot, so React can skip renders that changed nothing, and the subscription is torn
  down with the component.
- Cross-module change notification goes through the typed bus in `utility/event.ts`
  (`on`/`emit`/`off`). Adding an event means adding a line to its `EventMap`. Keep the
  import direction one-way — the emitter imports the bus, the bus imports only *types*
  back, or the two modules cycle.
- Context is used for exactly one thing: passing a dialog's `titleId` down to whatever
  renders its header (`ui/dialog.ts`). Read it with React 19's `use()`, not `useContext`.

## Routing

`createMemoryRouter` in `src/router.tsx` — there is no address bar in a Tauri window, and a
browser router would strand the app on `tauri.localhost/dashboard` after a reload.

- **Guards and startup decisions belong in `loader`, not in an effect.** `launchLoader`
  picks the opening screen and `dashboardLoader` enforces the lock before the route
  renders, so there is no flash of a screen that is about to be taken away.
- Every page is `lazy`, which keeps `ethers` (~370 KB) off the launch path.
- Loaders read defensively — a storage failure must land on a safe screen, never an empty
  window. Wrap each read in `.catch(() => undefined)` and fan them out with
  `Promise.all` rather than awaiting in sequence; each one is a Tauri IPC round-trip.

## Effects

Prefer a loader, a `useSyncExternalStore`, or a lazy `useState` initialiser. When an effect
is genuinely right:

- Read a caller's callback through a ref (`closeRef.current = onClose`) so an inline arrow
  does not re-register the listener every render — see `useDismiss` in `ui/dialog.ts`.
- Always return a cleanup that removes exactly what was added.
- Values that cannot change for the process lifetime resolve once in a lazy `useState`
  initialiser, not an effect — see `useIsWindows` in `hook/platform.ts`, which also has to
  `try`/`catch` because `platform()` throws outside a Tauri window.

## React 19 specifics

- `ref` is a plain prop; never add `forwardRef`.
- `use(Context)` replaces `useContext`.
- A context renders as `<Ctx value={...}>` — no `.Provider`.

## Lint — read this before writing

`eslint.config.ts` enables `js.configs.all`, `stylistic.configs.all`, `typescript.configs.all`
and `better-tailwindcss/recommended-error`. Effectively *every* rule is on, with a short
opt-out list. Consequences that bite:

- **Allman braces**, 4-space indent, semicolons, single quotes, `jsx-quotes: prefer-single`.
- **`{ spaced }` JSX curlies** — `{ value }`, `className={ cn(...) }`.
- **No trailing commas**, anywhere.
- **`@typescript-eslint/naming-convention`**: variables camelCase, functions PascalCase,
  types PascalCase. The two legitimate escapes are a component arriving through a prop
  (`as: Tag` in `text.tsx`) and a context object (`DialogTitleContext`), both of which JSX
  forces to be capitalised — each carries an `eslint-disable-next-line` with a comment
  saying why. Do not add a third without the same justification.
- **`strict-boolean-expressions`** is on: write `value !== undefined`, `list.length > 0`,
  `part.length === 0` — never a bare `!value` on a union.
- **`no-floating-promises`** warns; prefix fire-and-forget calls with `void`.
- **`no-console`** warns; the two deliberate uses carry a disable comment.

Run `npm run lint` (or `npm run lint:fix`) before you consider a change done. When a rule
surprises you, match the shape of the nearest existing file rather than fighting it.

## Do not

- Add a dependency. Check `package.json` first; this tree is deliberately small and `cn`
  exists because `clsx` + `tailwind-merge` were removed.
- Introduce a test file — there is no runner. Verification is `npm run build`, whose
  `check` step runs `script/cn.check.ts` and `script/contrast.js`.
- Reach for `useMemo`/`useCallback` reflexively. They appear here only where a real
  identity problem exists.
