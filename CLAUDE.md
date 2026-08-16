# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nura Wallet — a self-custodial Ethereum wallet for Windows, Linux and Android, built with **Tauri 2** (Rust shell) and a **React 19 + TypeScript + Tailwind CSS 4** frontend. Keys never leave the device: the recovery phrase is AES-GCM encrypted in the frontend before it is persisted, and the unlock passphrase is hashed with Argon2id via WebAssembly.

The app is the repository root — `package.json`, `src/` and `src-tauri/` all sit at the top level, so every command runs from there.

## Commands

```bash
npm run desktop        # tauri dev — the real dev loop
npm run dev            # Vite dev server (port 1420); the app does NOT mount in a plain browser tab
npm run build          # tsc typecheck + vite build (frontend only; a tauri build runs it for you)
npm run lint           # eslint .   (lint:fix to autofix)
npm run desktop-build  # tauri build — production desktop bundle
npm run android        # tauri android dev   (android-apk / android-aab to package)
```

There is **no test suite**; `npm run build` runs `tsc` as the typecheck gate. **Use `npm run desktop`** — [storage.ts](src/utility/storage.ts) `await`s the Tauri store plugin at module scope, so in a plain browser tab the module never resolves and the page stays blank.

`package-lock.json` is committed and CI installs with `npm ci`. **The version is declared only in [src-tauri/Cargo.toml](src-tauri/Cargo.toml)** — Tauri and Vite both read it from there, and CI fails a tagged run whose tag disagrees with it, so the bump lands as its own commit before the tag. Releases are cut by pushing a `v*` tag; the pipeline, asset naming and Android signing live in the **`release` skill** ([.claude/skills/release/SKILL.md](.claude/skills/release/SKILL.md)) — read it before tagging or editing [.github/workflows/release.yml](.github/workflows/release.yml).

## Architecture

### The native surface is deliberately thin

[src-tauri/src/lib.rs](src-tauri/src/lib.rs) exposes **no `#[tauri::command]` at all** — it registers plugins (single-instance and fs on desktop only, os, store and http everywhere) and the tray handler. Wallet derivation, hashing, encryption and UI are all frontend. Adding native capability means a command in `lib.rs` *plus* the matching permission in **each** per-platform capability block.

**The webview's own `fetch` is still how requests are made**, so a server that sends no usable `Access-Control-Allow-Origin` is a wall the frontend cannot climb (site favicons are the standing example). The `http` plugin is the one exception and is deliberately not a general replacement: [core/request.ts](src/core/request.ts) routes a **named list of hosts** through it and everything else through the webview, because a native request answers to no origin policy, no CSP and no cookie rules — a wallet wants those on unless there is a reason. Today the list holds one host, Nura's explorer, whose duplicated CORS header the webview cannot get past (see *Known, unfixed*), and the `http:default` scope in each capability block names that same host. Widening either is a decision, not a formality: **the list in `request.ts` and the three scopes must agree**, or a host fails at the plugin instead of at CORS and produces the same empty screen by a longer route.

Tauri is built with the **`unstable` feature**, which gates the multiwebview API; without it `new Webview(...)` always fails and the browser tab degrades to an iframe.

### Routing and the unlocked session

Navigation is a **`createMemoryRouter`** ([src/router.tsx](src/router.tsx)) — not a browser router. There is no address bar in a Tauri window, and a browser router would leave the app on a route it cannot serve after a reload. [RootLayout](src/layout/root.tsx) is the shell mounted once for the process (title bar, tray); only `Outlet` changes. Pages are `lazy`, which is what keeps `ethers` (~370 KB) out of the entry chunk — the dashboard is the only screen that touches it.

**Decisions belong in loaders, not effects.** `launchLoader` reads `Wallet.Mnemonic` + `Wallet.Password` together and redirects to `/unlock` or `/intro` before anything renders; `dashboardLoader` redirects when the vault is gone, which is what stops a history entry being walked back into after locking.

The decrypted secret is held in [src/core/session.ts](src/core/session.ts), a module singleton — **never in route state**, which React Router serializes into `history.state` and the WebView keeps across a reload. It is a singleton rather than context because a loader has to read it outside the React tree; `useVault()` is the in-tree view. Locking or logging out drops the reference and the only copy goes with it.

### Wallet core

[src/core/wallet.ts](src/core/wallet.ts) wraps `ethers` v6. `WalletManager` derives from a BIP39 mnemonic at `m/44'/60'/0'/0/{index}` (NFKD-normalized); `WalletManager.FromPrivateKey()` returns a `PrivateKeyWalletManager` with the **same public API**, so callers stay agnostic. `ValidatePrivateKey` builds the wallet and catches, because 64 hex characters is the *shape* of a key while zero and anything at or above the curve order are not keys, and ethers is what knows where that line is.

[src/core/vault.ts](src/core/vault.ts) is what travels through the tree: a `{ kind, secret }` pair plus `vaultManager` / `vaultAddress` / `vaultDerivable`. **The kind is read off the secret, never stored beside it** — a marker in the store is a second source of truth that can disagree with the payload, and a phrase (words) cannot be confused with a key (64 hex). That is also why wallets imported before private keys existed need no migration.

Only two things care about the kind: **a private key is one account and no index derives another**, so the account list is pinned to slot 0 and the add form is withheld rather than shown and refused; and the surfaces that *name* the secret must say "private key", since telling someone to restore from a seed phrase they never had is the difference between a recoverable wallet and a lost one. `Wallet.Mnemonic` keeps its name and holds either.

[src/page/dashboard.tsx](src/page/dashboard.tsx) owns the active account (a derivation index), the account list, the active network and the live balances, and feeds all three tabs and every modal from that one source. Its modals are `lazy()` — each pulls real weight (QR encoder, PNG writer, transfer flow) that would otherwise be parsed on the way to the wallet screen.

**A removed token stays removed.** `discoverTokens` adds contracts the account holds but does not track — which is exactly what a just-deleted token looks like — so `Wallet.TokensHidden` (lowercase addresses per chain) records the decision and discovery folds it into the same skip set. It is intent, not data, so it lives in the wallet store rather than a read cache, and only re-adding the contract by hand clears it.

### Storage and the crypto boundary

[src/utility/storage.ts](src/utility/storage.ts) is the single persistence layer: `@tauri-apps/plugin-store` (`application.bin`) with nothing wrapped around it. Keys are constrained to the `StorageKey` union. Alongside the plaintext accessors there is a batch `removeValues` (logout clears five keys in one file write, so the store either still has the wallet or has none of it) and an encrypted pair — AES-GCM 256 under an **Argon2id** key at the same cost as the unlock hash, fresh salt+IV per write, stored as base64 `{ salt, iv, cipher, kdf }`.

The auth flow: the password is Argon2id-hashed by [password.ts](src/core/password.ts) over a **fixed app-wide salt** and that hash is stored in plaintext for verification, while the mnemonic is stored encrypted under the raw password. `passwordCheck` distinguishes `invalid` from `missing`; `passwordIssue` is the single place the new-password rules live. **Treat the Argon2id cost parameters as frozen** — see *Known, unfixed*.

### Offline, and the read caches

**The app opens and reaches the dashboard with no connection at all.** Nothing on the launch path touches the network — `initTheme` / `initLanguage` / `initNetwork` read storage only and settle together through one `Promise.allSettled` in [app.tsx](src/app.tsx), so a rejection costs its own default rather than the window. Anything added there that waits on a remote answer breaks this.

[connection.ts](src/core/connection.ts) holds the belief as a module singleton (`navigator.onLine`, its two events, plus a re-read on `visibilitychange` because Android suspends the webview and a link that came and went leaves no event behind). **It reports a link, not a route** — `true` is optimistic, so every read still handles its own failure; `false` is reliable, and lets a read skip a request whose answer is known. Fetching hooks take `online` as an effect dependency, so a returning link re-reads on its own.

Reads go through [cache.store.ts](src/core/cache.store.ts), a batched quota-tolerant wrapper over Web Storage that degrades to an in-memory map. **Which area a cache uses is a statement about the data:**

- **session** — token and native balances ([token.cache.ts](src/core/token.cache.ts)). A balance read minutes ago is worth rendering while a fresh read runs; the same number restored after a restart is of unknown age and looks current.
- **local** — transactions ([history.cache.ts](src/core/history.cache.ts)), prices (one entry per coin id, so adding a token does not discard the others' prices), the discovery-sweep stamp, and the last-known balance snapshot. That snapshot earns its exception: written only by a successful read, read only when the chain was unreachable, and never travels without the moment it was written.

**The rule all of this serves: an unreachable network must never be able to say "zero".** A balance never read renders as an em dash, not `0`; unresolved prices render no total, not `$0.00`; an unfetched history says so rather than "no transactions". `readTokenBalances` maps one failing contract to a zero balance but **throws when every one fails**, because that is the chain being away. [dashboard.offline.tsx](src/components/dashboard/dashboard.offline.tsx) renders nothing when everything is current, so call sites need no conditional. [boundary.tsx](src/layout/boundary.tsx) — the only React class component in `src/`, since `getDerivedStateFromError` has no hook — catches a render throw, and its strings fall back to English literals because a failed language bundle is one of the things that can put the app there.

### The in-app browser

[src/layout/webview.tsx](src/layout/webview.tsx) (`WebFrame`) reserves a rectangle of the layout and paints a real browser view into it. **Not an iframe**: dApps and explorers send `X-Frame-Options` / `frame-ancestors` and refuse to be framed. Three paths:

- **Desktop** — a Tauri child webview parented to the app window. There is no `navigate` API, so a new `url` (or a `reload` bump) recreates the view. Creation, teardown and visibility are serialized through one promise chain because they all address a single label, and **one label means one webview** — every caller needs its own.
- **Android** — Tauri has no child webview there, so [BrowserBridge.kt](src-tauri/gen/android/app/src/main/java/io/nurawallet/android/BrowserBridge.kt) drives a plain `android.webkit.WebView` at the same rectangle, reached through `window.__nuraBrowser` ([core/browser.ts](src/core/browser.ts)) with state pushed back through `window.__nuraBrowserState`. The bridge is attached to the app's own webview only, never to the page webview. Bridge methods that postdate a shipped APK are typed **optional** and need a fallback — the bundle can be newer than the Kotlin beside it.
- **iframe** — the degraded fallback when child-webview creation fails.

**`enabled` hides the view; it never discards it.** The view is an OS-level surface painted *over* the layout, so nothing in the React tree can cover it — leaving the tab or opening a modal must hide it explicitly. Closing it instead threw the page away with it (scroll position, form input, dApp state). Only a changed `url`, an empty `url` or unmounting closes anything. Two consequences: a webview is born visible, so creation re-reads the live `enabled` through a ref; and the frame is not always measurable on the first effect, so both platforms wait for a usable rectangle rather than returning early.

Mobile/desktop layout is a **user-agent switch**, not a resize — the strings in `webview.tsx` are mirrored by `DESKTOP_AGENT` in `BrowserBridge.kt`; change one, change the other. Site icons come from each site's own `/favicon.ico`, never an icon service: one party learning a wallet's browsing history is the trade this app does not make. Favourites are **seeded, not fixed** — `defaultFavorites` is returned only when the key is absent, so a stored empty list stays empty.

### The image cache

[src/core/image.ts](src/core/image.ts) is the only thing that downloads a remote image; [useCachedImage](src/hook/image.ts) and `TokenIcon` are its only callers. Memory LRU → disk (OPFS, SHA-256 filenames, a `metadata.json` index) → network, with per-kind TTLs, stale-while-revalidate, `ETag` / `Last-Modified` refresh, bounded retries and a download semaphore.

**It uses the plain `fetch`, so CORS is the cost**: reading response bytes needs `Access-Control-Allow-Origin`, which CDN logos send and no site's favicon does. Token and network logos cache; site icons throw in `download()` and the hook falls back to the raw URL on the `img` tag, where the webview's own HTTP cache handles the repeat. `accepts()` requires an `image/*` type **and** a recognised magic-byte signature, but deliberately does not require the two to agree — a `.ico` is served as `image/x-icon` and is a PNG about as often as not.

### i18n and theming — module singletons, not context

Both are plain modules holding mutable state, applied to `<html>` attributes and persisted through storage. `T('Dotted.Key', ...args)` ([language.ts](src/utility/language.ts)) resolves against a lazily imported bundle from [src/assets/lang/](src/assets/lang/) — ten of them (`en fa ar es pt hi zh ru fr tr`), expected to hold an identical key set. **Every user-facing string goes through `T()` and needs an entry in all ten**; a missing key renders as `[Dotted.Key]` so gaps are visible, and `%s` tokens are replaced positionally in one pass (a value can never be rescanned as a placeholder). `fa` and `ar` set RTL. Flags are SVGs imported from [src/assets/flag/](src/assets/flag/), not a `flag-icons` class — that package's stylesheet pulled 3.8 MB of unreachable flags into `dist`.

[theme.ts](src/utility/theme.ts) writes `data-theme` on `<html>` and defaults to the OS colour scheme. Because both are singletons, components either read them at render (`getTheme()`, `getLanguage()`, `getDirection()`) and re-mount to reflect a change, or subscribe through `useSyncExternalStore` (`useLanguage`, `useOnline`, `useVault`) when they are mounted outside the tree that re-renders.

### Styling

Tailwind CSS 4 via `@tailwindcss/vite`, configured entirely in [src/assets/style.css](src/assets/style.css) (there is no `tailwind.config`). The design language is glassmorphism; the palette is **semantic oklch variables** swapped wholesale by `[data-theme]`, mapped to utilities through `@theme inline`. Use the semantic token families (`base-*`, `txt-*`, `btn-*`, `glass-*`, and the `tiny/small/medium/large/display` text scale) rather than raw colours. Animation is `motion/react`.

**There are no component CSS classes.** Glass surfaces and button fills are class strings exported next to the components that own them (`glassPanel` in [panel.tsx](src/components/ui/panel.tsx), `glassInput` in [field.tsx](src/components/ui/field.tsx), the fills in [button.tsx](src/components/ui/button.tsx)). Being ordinary utilities is what lets `cn()` resolve them against a call site's `className`; as unlayered CSS they silently outranked every utility. What is left in `style.css` is only what cannot live on a React element: tokens and palettes, `@font-face`, the global resets, a few pseudo-elements, and the two Swiper overrides — Swiper renders that markup itself from its own unlayered sheet, so those rules must stay unlayered too.

[src/utility/cn.ts](src/utility/cn.ts) is self-contained — **no `clsx`, no `tailwind-merge`**. Which utility wins in the browser is decided by the order Tailwind wrote them into the stylesheet, not by attribute order, so a component default can beat a call site's override; `cn()` drops the loser, which is what makes "the last one wins" true. It **keeps anything it does not recognise**, so an unlisted family fails safe. Adding a utility family that call sites must override means adding its prefix to `groupList`, and `text-` is special-cased because it spells both a size and a colour — the app's own scale has to be listed in `sizeMap` or one of the two is silently dropped.

**Tailwind scans this file too.** It auto-detects sources from the project root, so a class name written in prose here is generated into the bundle. Quote them sparingly.

### Shared UI kit

[src/components/ui/](src/components/ui/) holds the primitives every surface composes. **Every `<button>` routes through `Button`** (`variant='bare'` for a fully custom look), and **all typography goes through `Text`** — its variants are the only size/colour pairings the design makes, so a size or colour written inline is a smell (the exception is text inheriting its colour from a fill it sits in). `Button`, `Text`, `Alert`, `Checkbox` and `EmptyState` take content as a **`text` prop and self-close**; `children` is reserved for content that genuinely composes, and the two never combine. `Alert` renders nothing for an empty message, so it needs no surrounding conditional. `Button`'s two destructive fills are not interchangeable: `danger` is muted with red text for a remove control inside a list, `destructive` is the filled red one for an action that ends the session.

`Horizontal` and `Vertical` contribute only display and direction; reach for them for a layout container, but a `div` that is positioned, scrolled, carries a `ref` or a handler, or builds its classes through `cn()` was deliberately left alone. **Safe-area padding is owned by `PageContainer` and the `inset` constants in [container.tsx](src/layout/container.tsx)** — pick a variant; no page hand-writes `env(safe-area-inset-*)` or a per-platform padding fork, and those formulas must stay literal strings so Tailwind's scanner finds them.

### Platform shells

Config is layered — [tauri.conf.json](src-tauri/tauri.conf.json) plus `tauri.windows.conf.json`, `tauri.linux.conf.json` and `tauri.android.conf.json`, each declaring its **own** `main-capability` permission list. A permission added to one platform is absent on the others until added there too; only the desktop configs grant `fs:*`.

**Each of those three also declares its own `csp`, and `script-src` must keep `'wasm-unsafe-eval'`.** Argon2id is `hash-wasm`, so `WebAssembly.instantiate` sits on the path of every unlock, every wallet created or imported, and every read or write of the encrypted mnemonic — see *Storage and the crypto boundary*. Chromium refuses to compile a module under a `script-src` granting neither `'unsafe-eval'` nor `'wasm-unsafe-eval'`, and it refuses by throwing `CompileError` inside the handler, so the app rendered perfectly and every button that mattered did nothing at all. `devCsp` carries `'unsafe-eval'`, which permits WASM as a side effect, so `tauri dev` never showed it and only an installed build did. Keep the narrow token rather than widening to `'unsafe-eval'`: the production bundle contains no `new Function`, no `eval` and no `Worker`, so WASM compilation is the only thing that needs granting.

On Windows the app is **frameless** and runs a custom [titlebar.tsx](src/layout/titlebar.tsx) whose close button `hide()`s to the tray rather than quitting — which is why the single-instance plugin unminimizes and focuses the existing window. `useIsWindows()` gates all of it.

`src-tauri/gen/android/` is Tauri-generated but holds three **hand-written, committed** files that must survive: `MainActivity.kt` (edge-to-edge bars, high-refresh-rate request, bridge registration), `BrowserBridge.kt`, and `ExportBridge.kt` (recovery-phrase export through MediaStore, which no webview can reach — desktop uses the fs plugin instead, see [export.ts](src/core/export.ts)). CI re-runs `tauri android init` to restore the git-ignored scaffolding and has been verified to leave these byte-identical. Nothing under `gen/` is safely disposable.

**The launcher icon is committed under `gen/android/` too, and has to be.** `tauri android init` writes only the names that are missing — which is what leaves those three Kotlin files alone — but it fills every empty one from its template, and the template's `ic_launcher.png` is the Tauri logo. A density-qualified drawable beats a density-less one on every real device, so the single `res/mipmap/ic_launcher.png` this repo used to carry looked right in Android Studio and shipped the Tauri logo from CI, where init had just written `mipmap-mdpi…xxxhdpi`. The whole set is committed instead — five density buckets of `ic_launcher` / `ic_launcher_round` / `ic_launcher_foreground`, `mipmap-anydpi-v26/ic_launcher{,_round}.xml` and the `ic_launcher_background` colour — so init finds every name taken and writes none of them.

Regenerate with `npx tauri icon src-tauri/icons/app-icon.json -o <tmp>` and copy `<tmp>/android/` over `res/`. **Never point `-o` at `src-tauri/icons`**: it also writes the icns, ios and `Square*Logo` files that [tauri.windows.conf.json](src-tauri/tauri.windows.conf.json) and [tauri.linux.conf.json](src-tauri/tauri.linux.conf.json) deliberately do not list. `app-icon.json` names `icon-foreground.png` — `icon.png` **pre-inset** to 75% on a transparent canvas — because API 26+ masks the adaptive foreground to a 72dp circle out of 108dp, and at full bleed that cuts the ring and loses the sparkles entirely. The inset is baked into the image because the CLI's own `android_fg_scale` is ignored (2.11.4). The background is a flat `#000000`, which is the icon's own field, so the black square edge inside the foreground never shows.

## Conventions

- **ESLint runs every `all` config** ([eslint.config.ts](eslint.config.ts)): `@eslint/js` + `typescript-eslint` + `@stylistic` + `better-tailwindcss`. Formatting is enforced by lint, not Prettier — 4-space indent, semicolons, single quotes (including JSX), **Allman braces**, no trailing commas, spaces inside `{ }` / `[ ]` / template `${ }`. Match the surrounding style exactly.
- **Naming is enforced**: variable-like → camelCase, **`function` → PascalCase**, type-like → PascalCase. Components are `function` declarations for this reason; `lazy()` results are the one exception and disable the rule locally.
- JSDoc on exported utilities and components is the house style, and comments explain **why** — often recording what was tried and why it failed. Keep and extend them when editing rather than trimming them.
- `src-tauri/` is excluded from both tsconfig and eslint.
- Commits follow **Conventional Commits**, lowercase imperative subject ≤50 characters ([contributing.md](contributing.md)).

## Goals

**Tauri is the only target.** The plain web build is gone: `isTauri()` no longer exists, storage opens `application.bin` unconditionally, and a browser tab does not mount. What the old goal left behind is still right and not worth undoing — the OPFS image cache, `navigator.clipboard`, the plain `fetch`. A web API that does the job is still the simpler dependency; reaching for a plugin is a decision to justify. What it unlocked is `tauri-plugin-http` (tried and reverted twice purely because it tied a feature to Tauri) — that objection is void, and on 2026-08-16 it was added for the first thing that could not be done without it: reading Nura's own explorer past a broken CORS header. It is host-scoped rather than adopted wholesale — see *The native surface is deliberately thin*. Cacheable favicons are now a cost/benefit call rather than a rule, and are still not done.

**One theme, everywhere.** No literal colour outside `style.css`, and no new `.class` there that could be a utility. Two deliberate exceptions — **do not "fix" these**: the receive QR is pure black on white because scanners need the contrast, and the exported phrase PNG uses fixed hex because the file outlives the session that wrote it. They are also why this cannot be a lint rule.

## Known, unfixed

- **The Argon2id parameters are a broken compatibility contract.** Verification recomputes the hash with today's constants and compares it against one written under yesterday's, so a wallet created before they were raised past `m=32768 / t=2 / p=1` can no longer be unlocked. A proper fix stores the parameters beside the hash, verifies with the set it was written under, and re-hashes at the new cost after a successful unlock. The encrypted-mnemonic payload has the same weakness — it writes a `kdf` marker that nothing reads back — and a real fix covers both. Until then the constants are frozen.
- **Nura's explorer sends `Access-Control-Allow-Origin` twice, so every read of it fails CORS.** The header was missing, was fixed server-side on 2026-08-16, and was over-fixed: a second copy now rides on top of the one Blockscout already sends. Repeated headers are concatenated before the CORS check, so the browser reads `*, *`, rejects the response, and `fetch` throws `TypeError: Failed to fetch` — duplicated is exactly as fatal as absent. `curl` implements no CORS and reports the endpoint perfectly healthy, which is why this survived a verification pass; reproduce it from a page origin instead (`rpc.nurachain.net` sends one header and succeeds side by side with it). **The real fix is server-side — drop one copy**, and it is worth doing regardless: everything that is not this app still cannot read that explorer. What it broke here was history (`Dashboard.Activity.Unavailable`, "could not provide the history", from [hook/history.ts](src/hook/history.ts) catching the throw into `notice`) and token discovery (`readExplorerTokens` in [core/token.ts](src/core/token.ts) swallowing it into an empty list). **Neither file was at fault** — both now read through [core/request.ts](src/core/request.ts), which sends that one host through `tauri-plugin-http`, where the request is made by Rust and no origin policy applies. That is a bypass, not a repair; when the duplicate copy goes, the host comes out of `request.ts` and the three capability scopes. Do not reach for the chain instead: the node is go-ethereum with no `ots_*` and no `trace_filter`, `eth_getLogs` is capped at 10 000 blocks, and the v2/GraphQL endpoints are all 404.
- **The Nura chain is not empty**, whatever an in-app empty state suggests — that was believed on 2026-08-16 and was wrong. Against the API directly the chain is ~80 900 blocks deep, `txlist` returns native transfers for active accounts and `tokentx` returns Bridge USDT / Bridge BNB movements. An empty activity list on Nura is the CORS failure above, not the honest answer.
- **Nura Chain is a moving target** — it was re-launched under chain id **1020** (was 1010), corrected in [network.ts](src/core/network.ts) on 2026-08-16. Reads never notice a mismatch because `getProvider` passes the id with `staticNetwork`, but every signature is EIP-155 bound to it, so a stale constant fails **sending** and nothing else. Per-chain state filed under the old id was deliberately left unmigrated: the contracts it names do not exist on the new chain.
- **[storage.ts](src/utility/storage.ts) `await`s the store plugin at module scope**, so a store file that cannot be opened leaves the module — and the app — unresolved, with a blank window and no diagnostic. A fix has to decide what to show when the wallet on disk cannot be read, and an empty in-memory store is not it: the app would open on the intro screen, and a user told there is no wallet may re-import over one that was merely unreadable.
- [redeem.ts](src/core/redeem.ts) has no endpoint yet and resolves through a local stub; setting the base URL there is the whole change.
