# AGENTS.md

Guidance for AI coding agents working in this repository. Humans are welcome to read it too; the
[contributing guide](contributing.md) covers commits in more detail.

## What this is

**Nura Wallet** — a self-custodial EVM wallet for Nura Chain and other networks, with an in-app
dApp browser. One React 19 + TypeScript app ships three ways:

| Target | Built by | Entry |
|---|---|---|
| Desktop (Windows, macOS, Linux) | Tauri 2 | `src-tauri/`, `src/app.tsx` |
| Mobile (Android, iOS) | Tauri 2 | `src-tauri/`; the Android project is `src-tauri/gen/android` |
| Browser extension (Chrome, Edge, Firefox, Safari — MV3) | Vite | `src-extension/`, `vite.config.extension.ts` |

Keys never leave the device: the vault is Argon2id + AES-GCM at rest, and the unlocked session is
held in memory (in the extension, in `chrome.storage.session`). Treat every change near key
material as security-critical.

## Repository map

| Path | Holds |
|---|---|
| `src/page/` | Route-level screens (`intro`, `unlock`, `dashboard`) |
| `src/component/` | Screen-specific composites (`dashboard/*`, `intro/*`) |
| `src/ui/` | The design system — **the only place markup is written** |
| `src/layout/` | The router's shell: root layout, error boundary, route error |
| `src/core/` | Domain logic: vault, session, networks, tokens, dApp provider, caches |
| `src/hook/` | React bindings over `core` and `utility` singletons |
| `src/utility/` | Framework-free helpers: `cn`, storage, language, theme, format |
| `src/platform/` | The host seam — one implementation per target behind `#platform-impl` |
| `src/type/` | Every shared type, one file per area; `global.d.ts` for ambient ones |
| `src/assets/lang/` | UI strings for all ten languages |
| `src-extension/` | The extension's worker, content and in-page scripts, and its popup |
| `src-tauri/` | Rust shell, commands, per-platform config and capabilities |

Build output goes to `.dist/` and `.dist-extension/`; both are ignored.

## Commands

```bash
npm install                 # once
npm run dev                 # the web UI alone (Tauri APIs throw here — guard them)
npm run desktop             # tauri dev: the real desktop window
npm run android             # tauri android dev
npm run extension           # build all four extension targets into .dist-extension/
npm run build               # type-check and build the web bundle into .dist/

npm test                    # vitest
npx tsc --noEmit -p .       # app types
npm run -s extension:types  # extension types (its own tsconfig)
npm run lint                # oxlint
npm run format:check        # oxfmt
```

On Windows with a VPN or virtual adapter up, `tauri android dev` may pick the wrong network
address for the dev server. Pass the machine's LAN address explicitly:
`npx tauri android dev --host <lan-ip>` (not `npm run android -- --host`, which npm swallows).

## Rules the build enforces

These are checked by tests in `src/ui/`; a violation fails `npm test`.

1. **No markup outside `src/ui`.** Pages and components compose primitives; they never render an
   HTML or SVG tag, nor `motion.*`. If no primitive fits, add one to `src/ui`, named for what it
   is. *(`src/ui/usage.test.ts`)*
2. **No `className` on a `src/ui` primitive.** A primitive's look is named props mapped to
   literal classes; where it sits in its parent is the shared `Placement` set (`grow`, `shrink`,
   `squeeze`, margins, `self`, `wide`, `width`) from `src/ui/place.ts`. Never assemble a class name
   at runtime — Tailwind only generates classes it finds written out. *(`src/ui/ui.test.ts`)*
3. **A `Button`'s glyph goes in `icon`**, never as its lone child; a squeezable label goes in
   `label`. *(`src/ui/usage.test.ts`)*

## Conventions

- **Types:** a shared type lives in `src/type/<area>.ts`; a `src/ui` component keeps its own prop
  types beside it.
- **State:** module singletons read through `useSyncExternalStore`, as `hook/vault.ts` does.
- **Strings:** every user-facing string goes through `T()` and is added to all ten files in
  `src/assets/lang/`. Layout is RTL-safe: logical properties (`ps-`, `inset-e-`), never
  `left`/`right`.
- **Layers:** no bare `z-*`; use `layer` from `src/ui/container.tsx`.
- **No `aria-*` attributes**, anywhere — nor props or ids that only fed one. `role` and `inert` stay.
- **Files:** lowercase and dot-separated (`dashboard.send.tsx`), never PascalCase.
- **Tauri:** capabilities live in the per-platform `tauri.*.conf.json` files. `browser-capability`
  (third-party pages) grants exactly one command; widening it is a security decision.
- **dApp provider:** a request's origin is stamped by the transport, never read from the page.

## Verifying a change

1. `npm test`, `npx tsc --noEmit -p .`, `npm run lint`, `npm run format:check`. `npm run lint`
   currently exits non-zero on a pre-existing `prefer-math-min-max` error in `src/ui/webview.tsx`;
   lint the files you touched with `npx oxlint <files>` to see only your own.
2. For anything visible, run the app and look — the `run-wallet` skill drives the web UI, the
   desktop window and the extension, and takes screenshots. A refactor that must not change the UI
   should leave the rendered DOM's class lists identical.
3. Say what was not exercised: a platform you could not run, a screen you could not reach.

## Commits

Conventional Commits, as in the [contributing guide](contributing.md): a short lowercase
imperative subject, scoped (`fix(dashboard): …`, `build: …`). One commit per change. No
co-author, sign-off or tool trailers. Never commit `.env*` (except `.env.example`), keystores, or
`src-tauri/gen/android/keystore.properties`.

## Deeper guidance

Project skills in `.claude/skills/` hold the detail; read the matching one before working in its
area.

| Skill | Read before touching |
|---|---|
| `design-system` | Any JSX that renders UI — the primitive catalog and its rules |
| `frontend-design` | How a screen should look and behave: hierarchy, motion, states, a11y |
| `react` | Components, hooks, state, routing, tests, lint and format rules |
| `tailwindcss` | A class, the theme tokens, `cn`, `src/assets/style.css` |
| `motion-swiper` | Anything animated or swipeable |
| `wallet-security` | The vault, keys, password, session, storage, phrase export |
| `dapp-provider` | The injected provider, bridge, approvals, RPC methods |
| `extension` | The MV3 extension and the platform seam |
| `tauri` | Rust, commands, capabilities, plugins, CSP, mobile targets |
| `run-wallet` | Running, driving and screenshotting the app |
