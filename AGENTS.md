# AGENTS.md

Guidance for AI coding agents working in this repository. Humans are welcome to read it too; the
[contributing guide](contributing.md) covers commits in more detail.

This is the only such file. Claude Code v2.1.281 or later reads it in place of a `CLAUDE.md`, and
stops reading it once a `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists here or in a
folder above, so do not add one.

## Rules

- **No `aria-*` attributes anywhere in the project.** Do not add one to JSX, a `src/ui` primitive,
  the extension, or injected markup, even where a skill, a doc or an accessibility checklist asks
  for it. Do not add props or ids whose only purpose was to feed one (`titleId`, `labelledBy`,
  `closeLabel`, `describedBy`). `role` and `inert` are allowed. The `svg aria-hidden` that
  lucide renders comes from the library and is fine.

No test catches that one. The rules a test does catch are under
[Rules the build enforces](#rules-the-build-enforces).

## What this is

**Nura Wallet** — a self-custodial EVM wallet for Nura Chain and other networks, with an in-app
dApp browser. One React 19 + TypeScript app ships three ways:

| Target | Built by | Entry |
| --- | --- | --- |
| Desktop (Windows, macOS, Linux) | Tauri 2 | `src-tauri/`, `src/app.tsx` |
| Mobile (Android, iOS) | Tauri 2 | `src-tauri/`; the native projects are `src-tauri/gen/android` and `src-tauri/gen/apple` |
| Browser extension (Chrome, Edge, Firefox, Safari — MV3) | Vite | `src-extension/`, `vite.config.extension.ts` |

The Android project is in the tree. Of the iOS one only `Sources/NuraWallet/BrowserBridge.mm` is:
`tauri ios init` writes the rest, and it needs a Mac.

Keys never leave the device: the vault is Argon2id + AES-GCM at rest, and the unlocked session is
held in memory (in the extension, in `chrome.storage.session`). Treat every change near key
material as security-critical.

## Commands

```bash
npm install                 # once
npm run dev                 # the web UI alone (Tauri APIs throw here — guard them)
npm run desktop             # tauri dev: the real desktop window
npm run android             # tauri android dev
npm run ios                 # tauri ios dev (macOS only)
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

These are checked by tests in `src/test/`; a violation fails `npm test`.

1. **No markup outside `src/ui`.** Pages and components compose primitives; they never render an
   HTML or SVG tag, nor `motion.*`. If no primitive fits, add one to `src/ui`, named for what it
   is. *(`src/test/usage.test.ts`)*
2. **No `className` on a `src/ui` primitive.** A primitive's look is named props mapped to
   literal classes; where it sits in its parent is the shared `Placement` set (`grow`, `shrink`,
   `squeeze`, margins, `self`, `wide`, `width`) from `src/ui/place.ts`. Never assemble a class name
   at runtime — Tailwind only generates classes it finds written out. *(`src/test/ui.test.ts`)*
3. **A `Button`'s glyph goes in `icon`**, never as its lone child; a squeezable label goes in
   `label`. *(`src/test/usage.test.ts`)*

## Conventions

- **Types:** a shared type lives in `src/type/<area>.ts`; a `src/ui` component keeps its own prop
  types beside it.
- **State:** module singletons read through `useSyncExternalStore`, as `hook/vault.ts` does.
- **Strings:** every user-facing string goes through `T()` and is added to all ten files in
  `src/assets/lang/`. Layout is RTL-safe: logical properties (`ps-`, `inset-e-`), never
  `left`/`right`.
- **Layers:** no bare `z-*`; use `layer` from `src/ui/container.tsx`.
- **Files:** lowercase and dot-separated (`dashboard.send.tsx`), never PascalCase.
- **Comments:** only where they are needed — a reason, a constraint or a trap the code cannot show
  by itself. Never one that restates the code, labels a section, or narrates a change.
- **Tauri:** capabilities live in the per-platform `tauri.*.conf.json` files. `browser-capability`
  (third-party pages) grants exactly one command; widening it is a security decision.
- **dApp provider:** a request's origin is stamped by the transport, never read from the page.
- **Version:** written twice, as `version` in `src-tauri/Cargo.toml` and in
  `src-tauri/tauri.conf.json`. A bump edits both, plus `Cargo.lock`; the release workflow fails
  when they differ.

## Verifying a change

1. `npm test`, `npx tsc --noEmit -p .`, `npm run lint`, `npm run format:check`. `npm run lint`
   currently exits non-zero on a pre-existing `prefer-math-min-max` error in `src/ui/webview.tsx`;
   lint the files you touched with `npx oxlint <files>` to see only your own.
2. For anything visible, run the app and look. A refactor that must not change the UI should leave
   the rendered DOM's class lists identical.
3. Say what was not exercised: a platform you could not run, a screen you could not reach.

## Commits

Conventional Commits, as in the [contributing guide](contributing.md): a short lowercase
imperative subject, scoped (`fix(dashboard): …`, `build: …`). One commit per change. No
co-author, sign-off or tool trailers. Never commit `.env*` (except `.env.example`), keystores, or
`src-tauri/gen/android/keystore.properties`.
