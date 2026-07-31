# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nura Wallet — a cross-platform (Windows desktop + Android) Ethereum wallet built with **Tauri 2** (Rust shell) and a **React 19 + TypeScript + Tailwind CSS 4** frontend. Keys never leave the device: mnemonics are AES-GCM encrypted in the browser before being persisted, and the passphrase is hashed with Argon2id in the browser via WebAssembly.

## Commands

```bash
npm run dev            # Vite dev server only (browser preview, port 1420) — Tauri APIs throw here
npm run desktop        # tauri dev — run the full desktop app (this is the real dev loop)
npm run desktop-build  # tauri build — production desktop bundle
npm run android        # tauri android dev
npm run android-apk    # build APK   (android-aab for AAB)
npm run build          # tsc typecheck + vite build (frontend only; runs automatically before a tauri build)
npm run lint           # eslint .    (lint:fix to autofix)
```

There is no test suite. `npm run build` runs `tsc` as the typecheck gate. Prefer `npm run desktop` over `npm run dev` for anything touching Tauri APIs (`@tauri-apps/*`, `invoke`, store, platform) — those throw outside a Tauri window.

## Architecture

### Two halves, thin native surface
The Rust backend ([src-tauri/src/](src-tauri/src/)) is deliberately minimal — it exposes **no commands at all**. [lib.rs](src-tauri/src/lib.rs) only wires up the store and os plugins plus the desktop tray handler. Everything — wallet derivation, password hashing, encryption, UI — lives in the frontend. New native capability means: add a `#[tauri::command]`, register it in an `invoke_handler` in [lib.rs](src-tauri/src/lib.rs), and add the matching permission in the per-platform capabilities block (see below).

### Frontend entry & the page bus
[src/app.tsx](src/app.tsx) is the root. `initTheme()` and `initLanguage()` run **before** `createRoot`, then `Application` decides the first page: if `Wallet.Mnemonic` + `Wallet.Password` exist in storage → `UnlockPage`, else `IntroPage`.

Navigation is **not** a router. It's a custom event bus ([src/utility/event.ts](src/utility/event.ts)) with a typed `EventMap`. `openPage(Component, props)` ([src/utility/context.tsx](src/utility/context.tsx)) emits `Page.Open` with a rendered element; [src/layout/page.tsx](src/layout/page.tsx) holds the single active page in state and swaps it (wrapped in `AnimatePresence`). There is one page at a time, no history/back stack. The same bus reserves `Toast.*` and `Modal.*` events. To navigate, import the target page component and call `openPage(...)` — don't reach for a router.

### Wallet core
[src/core/wallet.ts](src/core/wallet.ts) wraps `ethers` v6. `WalletManager` derives from a BIP39 mnemonic at `m/44'/60'/0'/0/{index}` (NFKD-normalized). `WalletManager.FromPrivateKey()` returns a `PrivateKeyWalletManager` with the **same public API** (`retrieve`/`sign`/`verify`/`toString`) so callers stay agnostic to the key source. Static helpers: `Generate`, `Validate`, `Verify`.

### Storage & crypto boundary
[src/utility/storage.ts](src/utility/storage.ts) is the single persistence layer over `@tauri-apps/plugin-store` (`application.bin`). Keys are constrained to the `StorageKey` union (`App.Language`, `App.Theme`, `Wallet.Mnemonic`, `Wallet.Password`). Two tiers:
- `setValue`/`getValue` — plaintext (used for theme, language, and the Argon2 password *hash*).
- `setValueEncrypted`/`getValueEncrypted` — AES-GCM 256 with a PBKDF2-SHA256 (102400 iters) key derived from a passphrase; fresh random salt+IV per write, stored as base64 `{salt,iv,cipher}`. The passphrase is never persisted; a wrong passphrase surfaces as a thrown error (GCM auth tag).

The auth flow (see [src/page/unlock.tsx](src/page/unlock.tsx) and [src/components/intro/intro.wallet.tsx](src/components/intro/intro.wallet.tsx)): the password is Argon2id-hashed by [src/core/password.ts](src/core/password.ts) — `hash-wasm`, m=32768 KiB / t=2 / p=1 / 32 bytes over a **fixed app-wide salt**, hex-encoded — and that hash is stored plaintext for verification, while the mnemonic is stored encrypted under the raw password. Unlock verifies the hash, then decrypts the mnemonic. The parameters and salt are byte-compatible with the Rust `APP_SALT` implementation they replaced, so hashes written by older builds still verify; changing any of them invalidates every stored hash.

### i18n & theming (module singletons, not React context)
Both are plain modules holding mutable state, applied to `<html>` attributes, and persisted via storage:
- **Language** ([src/utility/language.ts](src/utility/language.ts)): `T('Dotted.Key', ...args)` resolves against a lazily `import()`-ed bundle in [src/assets/lang/](src/assets/lang/) (`en.json`, `fa.json`). Missing keys render as `[Dotted.Key]` so gaps are visible. `%s` tokens are replaced positionally. Sets `document.documentElement.lang` and `dir` (`fa`/`ar` → RTL). **Every user-facing string goes through `T()` and needs an entry in both `en.json` and `fa.json`.**
- **Theme** ([src/utility/theme.ts](src/utility/theme.ts)): writes `data-theme="light|dark"` on `<html>`; defaults to OS `prefers-color-scheme`.

Because these are singletons (not context), components read them at render (`getTheme()`, `getLanguage()`, `getDirection()`) and re-mount to reflect changes (e.g. the Swiper is keyed on `getLanguage().code`).

### Styling
Tailwind CSS 4 via `@tailwindcss/vite`, configured entirely in [src/assets/style.css](src/assets/style.css) (no `tailwind.config`). The design language is glassmorphism. Palette is **semantic CSS variables** in oklch, swapped wholesale by `[data-theme]`; `@theme inline` maps them to utilities. **Use the semantic tokens** (`bg-base-1`, `text-txt-normal`, `btn-primary`, `glass-panel`, `glass-input`, `text-tiny/small/medium/large`) rather than raw colors. Component classes `.glass-panel`, `.glass-input`, `.chip-control`, `.btn-{muted,normal,primary,secondary}` are defined here. Animations use `motion/react` (Framer Motion).

### Shared UI kit
[src/components/ui/](src/components/ui/) holds the primitives every surface composes — `Button` (CVA variants over the `.btn-*`/`.chip-control` fills; **every `<button>` in the app routes through it**, with `variant='bare'` for fully custom looks), `TextField`/`PasswordField`, `Modal`/`ModalHeader`, `Sheet`/`SheetHeader`, `Alert`, `IconBox`, `Spinner`, `Checkbox`, `MenuRow`, `SectionHeader`, `EmptyState`. Shared feature rows live beside their domain: [token.row.tsx](src/components/token.row.tsx), [dashboard.transaction.tsx](src/components/dashboard/dashboard.transaction.tsx), [dashboard.nav.tsx](src/components/dashboard/dashboard.nav.tsx). `cn()` ([src/utility/cn.ts](src/utility/cn.ts), clsx + tailwind-merge) merges classes so a call site's `className` wins over a component default. **Platform safe-area padding is owned by `PageContainer` and the `inset` constants in [src/layout/container.tsx](src/layout/container.tsx)** — no page hand-writes `env(safe-area-inset-*)` or an `isWindows` padding fork.

### Windows-specific shell
On Windows the app is **frameless** (`decorations: false`, see [tauri.windows.conf.json](src-tauri/tauri.windows.conf.json)) and runs a custom [src/layout/titlebar.tsx](src/layout/titlebar.tsx) (drag region + min/max/close, close → `hide()` not quit) plus a system tray ([app.tsx](src/app.tsx)). `useIsWindows()` ([src/hook/platform.ts](src/hook/platform.ts)) gates this and returns `false` outside Tauri. Config is layered: [tauri.conf.json](src-tauri/tauri.conf.json) (base) + `tauri.windows.conf.json` + `tauri.android.conf.json`.

## Conventions

- **ESLint is `all`-configs strict** ([eslint.config.ts](eslint.config.ts)): `@eslint/js` all + `typescript-eslint` all + `@stylistic` all + `better-tailwindcss`. Formatting is enforced by lint, not Prettier: **4-space indent, semicolons, single quotes (incl. JSX), Allman braces, no trailing commas, spacing inside `{ }`/`[ ]` and template `${ }`**. Match the surrounding style exactly.
- **Naming convention is enforced**: `variableLike` → camelCase, `function` → **PascalCase**, `typeLike` → PascalCase. React components and top-level functions are PascalCase by rule, not just convention.
- TypeScript is `strict` with `noEmit` (Vite/tsc split); path is bundler resolution, `resolveJsonModule` on.
- JSDoc blocks are used liberally on exported utilities and components — keep them when editing.
- `src-tauri/` is git-ignored for its `target/` build artifacts and is excluded from tsconfig/eslint.
