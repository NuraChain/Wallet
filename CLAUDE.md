# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nura Wallet — a cross-platform (Windows, Linux, Android) Ethereum wallet built with **Tauri 2** (Rust shell) and a **React 19 + TypeScript + Tailwind CSS 4** frontend. Keys never leave the device: mnemonics are AES-GCM encrypted in the browser before being persisted, and the passphrase is hashed with Argon2id in the browser via WebAssembly.

The app is the repository root — `package.json`, `src/` and `src-tauri/` all sit at the top level, so every command below runs from there and CI needs no working directory of its own. It used to live one level down in `Application/`, which is worth knowing only because a stale checkout or an old link may still say so.

## Commands

```bash
npm run dev            # Vite dev server only (port 1420) — the app does NOT mount in a plain tab
npm run desktop        # tauri dev — run the full desktop app (this is the real dev loop)
npm run desktop-build  # tauri build — production desktop bundle
npm run android        # tauri android dev
npm run android-apk    # build APK   (android-aab for AAB)
npm run build          # tsc typecheck + vite build (frontend only; runs automatically before a tauri build)
npm run lint           # eslint .    (lint:fix to autofix)
```

There is no test suite. `npm run build` runs `tsc` as the typecheck gate. **`npm run desktop` is the dev loop**: the app only runs inside a Tauri window, and `storage.ts` opens the store plugin at module scope, so a plain browser tab leaves the module unresolved and the page blank. `npm run dev` is still useful for serving the bundle to a Tauri window, not for looking at it in a browser.

`package-lock.json` is committed and CI installs from it with `npm ci`. **The version is declared only in `src-tauri/Cargo.toml`** — Tauri and Vite both read it from there, and CI fails a tagged run whose tag disagrees with it, so the bump is its own commit before the tag.

Releases are cut by pushing a `v*` tag, which builds every platform and attaches twelve renamed installers to a draft release. The pipeline, the asset-naming scheme and the Android signing requirements are documented in the **`release` skill** ([.claude/skills/release/SKILL.md](.claude/skills/release/SKILL.md)) — read it before tagging or editing [.github/workflows/release.yml](.github/workflows/release.yml).

## Architecture

### Two halves, thin native surface
The Rust backend ([src-tauri/src/](src-tauri/src/)) is deliberately minimal — it exposes **no commands at all**. [lib.rs](src-tauri/src/lib.rs) only registers plugins (single-instance and fs on desktop only, os and store everywhere) and the desktop tray handler. **There is no `http` plugin** — every request in the app goes through the webview's own `fetch`, which is what the explorer note under *Known, unfixed* is about. Everything — wallet derivation, password hashing, encryption, UI — lives in the frontend. New native capability means: add a `#[tauri::command]`, register it in an `invoke_handler` in [lib.rs](src-tauri/src/lib.rs), and add the matching permission to **each** per-platform capabilities block (see below).

Tauri is built with the **`unstable` feature**, which is what gates the multiwebview API. Without it `new Webview(...)` always fails and the browser tab silently degrades to an iframe.

### Frontend entry & the page bus
[src/app.tsx](src/app.tsx) is the root. `initTheme()`, `initLanguage()` and `initNetwork()` are applied **at module scope** before `createRoot`, through one `Promise.allSettled` — they are independent and each falls back to a default of its own, so a rejection is logged rather than fatal. Awaited in sequence, as they were, one rejecting left the module unresolved: a blank window with no diagnostic. Anything added there follows the same rule, and must not wait on the network (see *Offline, and the read caches*). The tree is wrapped in [ErrorBoundary](src/layout/boundary.tsx). `Application` then picks the first page in an effect: `Wallet.Mnemonic` + `Wallet.Password` both present → `UnlockPage`, else `IntroPage`.

Navigation is **not** a router. It's a custom event bus ([src/utility/event.ts](src/utility/event.ts)) with a typed `EventMap`. `openPage(Component, props)` ([src/utility/context.tsx](src/utility/context.tsx)) emits `Page.Open` with a rendered element; [src/layout/page.tsx](src/layout/page.tsx) holds the single active page in state and swaps it (wrapped in `AnimatePresence`). There is one page at a time, no history/back stack. The same bus reserves `Toast.*` and `Modal.*` events. To navigate, import the target page component and call `openPage(...)` — don't reach for a router.

### Wallet core
[src/core/wallet.ts](src/core/wallet.ts) wraps `ethers` v6. `WalletManager` derives from a BIP39 mnemonic at `m/44'/60'/0'/0/{index}` (NFKD-normalized). `WalletManager.FromPrivateKey()` returns a `PrivateKeyWalletManager` with the **same public API** (`retrieve`/`sign`/`verify`/`toString`) so callers stay agnostic to the key source. Static helpers: `Generate`, `Validate`, `Verify`, `ValidatePrivateKey` — the last builds the wallet and catches, because 64 hex characters is the shape of a key but zero and anything at or above the curve order are the wrong ones, and ethers is what knows where that line is.

A wallet can be opened from either, so [src/core/vault.ts](src/core/vault.ts) is what actually travels through the tree — a `{ kind, secret }` pair plus `vaultManager`/`vaultAddress`/`vaultDerivable`, so a surface that just needs a signer builds one without asking which sort it has. **The kind is read off the secret, never stored beside it** (`readVault`): a marker in the store is a second source of truth that can disagree with the payload it describes, and a wallet whose marker says "mnemonic" over a private key cannot be opened at all — while a phrase (words) and a key (64 hex) cannot be confused. That is also why wallets imported before private keys existed need no migration.

Only two things care about the kind. **A private key is one account and no index derives another**, so the account list is pinned to slot 0 and the add form in [dashboard.account.tsx](src/components/dashboard/dashboard.account.tsx) is withheld rather than shown and refused; and the surfaces that *name* the secret — the settings row, the reveal modal, the logout warning — have to say "private key", since telling someone to restore from a seed phrase they never had is the difference between a recoverable wallet and a lost one. `Wallet.Mnemonic` keeps its name and holds either.

The dashboard owns the unlocked vault and passes derived state down: [src/page/dashboard.tsx](src/page/dashboard.tsx) holds the active account (a derivation index), the account list, the active network and the live balances, then feeds all three tabs and every transfer modal from that one source.

**A removed token stays removed.** `discoverTokens` in [token.ts](src/core/token.ts) adds contracts the account is *holding but not tracking*, which is exactly what a token the user just deleted looks like — so deleting one and refreshing brought it straight back. `Wallet.TokensHidden` (a `HiddenMap`, lowercase addresses per chain) is the record of that decision, and discovery folds it into the same skip set as the tracked list, covering both the explorer rows and the blind `knownTokens` fallback. It is intent rather than data, so it lives in the wallet store, not a read cache, and only the user adding the contract by hand clears it (`unhideToken`). A held balance is never a reason to re-add something they said no to. Note it pairs with `Wallet.Tokens`, which logout also leaves in place.

### Storage & crypto boundary
[src/utility/storage.ts](src/utility/storage.ts) is the single persistence layer, and it is `@tauri-apps/plugin-store` with nothing wrapped around it: `application.bin`, loaded eagerly at module scope, its own `get`/`set`/`delete`/`save` called directly by the accessors. It used to abstract that behind a `Backend` interface with a `localStorage` implementation for a plain browser tab; that build target is gone (see *Tauri is the only target*) and so is the interface. Keys are constrained to the `StorageKey` union — `App.{Language,Theme,Network,Networks}`, `Wallet.{Mnemonic,Password,Name,Accounts,Active,Tokens,TokensHidden}`, `Browser.{View,History,Favorites}`. Three plaintext accessors (`getValue`/`setValue`/`removeValue`), a batch `removeValues` (logout clears five keys in one file write, so the store either still has the wallet or has none of it), and an encrypted pair:

- `setValueEncrypted`/`getValueEncrypted` — AES-GCM 256 with a PBKDF2-SHA256 (102400 iters) key derived from a passphrase; fresh random salt+IV per write, stored as base64 `{ salt, iv, cipher }`. The passphrase is never persisted; a wrong passphrase surfaces as a thrown error (GCM auth tag). Note the payload carries **no parameter marker** — the KDF settings are implicit in the code, so changing them breaks every stored blob.

The auth flow (see [src/page/unlock.tsx](src/page/unlock.tsx) and [src/components/intro/intro.wallet.tsx](src/components/intro/intro.wallet.tsx)): the password is Argon2id-hashed by [src/core/password.ts](src/core/password.ts) — `hash-wasm` over a **fixed app-wide salt**, hex-encoded — and that hash is stored plaintext for verification, while the mnemonic is stored encrypted under the raw password. Unlock verifies the hash via `passwordCheck` (which distinguishes `invalid` from `missing`), then decrypts the mnemonic. `passwordIssue` is the single place the new-password rules live.

**The Argon2id cost parameters are a compatibility contract, and it is currently broken** — see *Known, unfixed* below. Treat them as frozen.

### The in-app browser
The browser tab is the one feature with a real native surface on both platforms, and it takes a different path on each.

[src/layout/webview.tsx](src/layout/webview.tsx) (`WebFrame`) reserves a rectangle of the layout and paints a real browser view into it. **Not an iframe**: dApps and explorers send `X-Frame-Options`/`frame-ancestors` and refuse to be framed, so an iframe stays blank on exactly the sites this exists for. Three paths, in order:

- **Desktop** — a Tauri child webview parented to the app window, positioned by a `ResizeObserver`. There is no `navigate` API, so a new `url` (or a bump of `reload`) recreates the view. Creation, teardown and visibility are serialized through one promise chain because they all address a single label. Only one webview can own a label — every caller needs its own.
- **Android** — Tauri's child webview does not exist there, so [BrowserBridge.kt](src-tauri/gen/android/app/src/main/java/io/nurawallet/android/BrowserBridge.kt) drives a plain `android.webkit.WebView` positioned to the same rectangle. It is reached through `window.__nuraBrowser` ([src/core/browser.ts](src/core/browser.ts)); navigation state comes back through `window.__nuraBrowserState`. The bridge is attached to the app's own webview only, never to the page webview, so a visited site cannot reach it. Bridge methods are typed **optional** where they postdate a shipped APK (`setDesktop?`, `setVisible?`) — the frontend ships in the bundle and can be newer than the Kotlin beside it, and each needs a fallback for the older Kotlin.
- **iframe** — the degraded fallback when child-webview creation fails.

**`enabled` hides the view; it never discards it.** The view is an OS-level surface painted *over* the layout on both platforms, so nothing in the React tree can cover it — leaving the tab or opening a modal has to say so explicitly (`hide()`/`show()` on desktop, `setVisible` on Android). Closing it instead was the original approach and it threw the page away with it, so a trip to the wallet tab reloaded the site and lost scroll position, form input and dApp state. Only a changed `url`, an empty `url` or unmounting closes anything. Two consequences worth knowing: a webview is *born visible* with no option to create it hidden, so creation re-reads the live `enabled` through a ref before handing over; and the frame is not always measurable when an effect first runs, so both platforms wait for a usable rectangle rather than giving up — an early return there is what used to strand the tab on its loading placeholder.

Mobile/desktop layout is a **user-agent switch**, not a resize: the strings live in `webview.tsx` and are mirrored by `DESKTOP_AGENT` in `BrowserBridge.kt`. Change one, change the other. Visited history is plaintext under `Browser.History`, capped at 40 entries; site icons are fetched from each site's own `/favicon.ico` rather than an icon service, deliberately — one party learning a wallet's browsing history is the trade this app does not make.

The start screen has two shortcut lists: the favourites under `Browser.Favorites`, and the visited list. Favourites are **seeded, not fixed** — `defaultFavorites` in [src/core/browser.ts](src/core/browser.ts) is returned only when the key is absent, so a stored empty list stays empty. They are edited in place behind an edit toggle, keyed by a random `id` rather than by URL because the URL is the field being edited. The active network's explorer is the one shortcut not in that list — it has no fixed address to store — so it is passed in, rendered at the head of the same grid, and steps out in edit mode since editing cannot reach it.

### The image cache
[src/core/image.ts](src/core/image.ts) is the only thing in the app that downloads a remote image; [useCachedImage](src/hook/image.ts) and `TokenIcon` are the only things that call it. Memory (LRU) → disk (OPFS under `image-cache/`, SHA-256 filenames, a `metadata.json` index) → network, with per-kind TTLs, stale-while-revalidate, `ETag`/`Last-Modified` conditional refresh, bounded retries and a download semaphore.

**Downloads use the plain `fetch` and no native surface.** The cost is CORS: reading response bytes requires `Access-Control-Allow-Origin`, which CDN logos send and **no site's favicon does**. So token and network logos cache; site icons cannot, throw in `download()`, and are never stored. When the cache returns empty the hook falls back to the raw URL and the `img` tag loads it directly — the icon still shows, and the webview's own HTTP cache handles the repeat. Routing this through `tauri-plugin-http` would make favicons cacheable, was tried, and was reverted because it tied the cache to Tauri — an objection that no longer holds (see *Tauri is the only target*).

`accepts()` requires an `image/*` content type **and** a recognised magic-byte signature, but deliberately does not require the two to name the same format: a `favicon.ico` is served as `image/x-icon` and is a PNG about as often as not.

### Offline, and the read caches
**The app opens and reaches the dashboard with no connection at all.** Nothing on the launch path touches the network — the three inits read storage only — and nothing that does touch it is allowed to block a render or fabricate a number. Anything added to the startup path that waits on a remote answer breaks this.

[src/core/connection.ts](src/core/connection.ts) holds the belief, as a module singleton like theme and language: `navigator.onLine` plus its two events, plus a re-read on `visibilitychange` because Android suspends the webview and a link that came and went while it was down leaves no event behind. `emit('Connection.Change')` announces it and [useOnline](src/hook/connection.ts) subscribes through `useSyncExternalStore`. **It reports a link, not a route** — `true` is optimistic (captive portals, routeless VPNs, DNS outages all read `true`, as the note in `image.ts` says), so every read still handles its own failure; `false` is reliable, and it is what lets a read skip a request whose answer is already known. Every hook that fetches takes `online` as an effect dependency, so a link coming back re-reads on its own.

Reads are cached through [src/core/cache.store.ts](src/core/cache.store.ts) — a batched, quota-tolerant wrapper over Web Storage with `prune`/`clearUnder`, degrading to an in-memory map where storage throws. **Which area a cache uses is a statement about the data**, and the split is the thing to preserve:

- **session** — [token.cache.ts](src/core/token.cache.ts) balances. A balance read minutes ago is worth rendering while a fresh read runs behind it; the same number restored after a restart is of unknown age and looks exactly like a current one.
- **local** — [history.cache.ts](src/core/history.cache.ts) transactions (a transaction that happened stays happened), the price cache in [price.ts](src/core/price.ts) (one entry per coin id, so adding a token does not throw away the prices of the others), the discovery-sweep stamp, and the **last-known balance snapshot**.

That snapshot is the one exception to the session rule, and it earns it two ways: it is written only by a successful read, and it is *read* only when the chain could not be reached at all. It never travels without the moment it was written, and the wallet tab renders that age beside the figure.

**The rule this all serves: an unreachable network must never be able to say "zero".** A balance that was never read renders as `—`, not `0`; a portfolio whose prices could not be resolved renders as `—`, not `$0.00`; an unfetched history says so rather than "no transactions". `readTokenBalances` maps a single failing contract to a zero balance but **throws when every one of them fails**, because that is the chain being away rather than the tokens being empty. [dashboard.offline.tsx](src/components/dashboard/dashboard.offline.tsx) is the strip that makes the whole thing honest — it renders nothing when everything is current, so call sites need no conditional.

The failure surfaces are the other half. `initTheme`/`initLanguage`/`initNetwork` each read storage defensively and settle together through `Promise.allSettled` in [app.tsx](src/app.tsx), so one rejecting costs its own default rather than the window, and [src/layout/boundary.tsx](src/layout/boundary.tsx) — the only class component in `src/`, since `getDerivedStateFromError` has no hook — catches a render throw and offers a reload instead of a blank window. Its strings fall back to English literals, because the language bundle failing to load is one of the things that can put the app there.

### Hand-written Kotlin inside a generated directory
`src-tauri/gen/android/` is Tauri-generated but holds three hand-written files that are committed and must survive: [MainActivity.kt](src-tauri/gen/android/app/src/main/java/io/nurawallet/android/MainActivity.kt) (edge-to-edge transparent system bars, high-refresh-rate request, bridge registration), `BrowserBridge.kt`, and `ExportBridge.kt` (recovery-phrase export via MediaStore, which no webview can reach — desktop uses the fs plugin instead, see [src/core/export.ts](src/core/export.ts)). CI re-runs `tauri android init` to restore the git-ignored scaffolding; that has been verified to leave these byte-identical. Don't assume anything under `gen/` is disposable.

### i18n & theming (module singletons, not React context)
Both are plain modules holding mutable state, applied to `<html>` attributes, and persisted via storage:

- **Language** ([src/utility/language.ts](src/utility/language.ts)): `T('Dotted.Key', ...args)` resolves against a lazily `import()`-ed bundle in [src/assets/lang/](src/assets/lang/) — ten of them, `en fa ar es pt hi zh ru fr tr`. Missing keys render as `[Dotted.Key]` so gaps are visible. `%s` tokens are replaced positionally. Sets `document.documentElement.lang` and `dir` (`fa`/`ar` → RTL). **Every user-facing string goes through `T()` and needs an entry in all ten bundles** — they are expected to hold an identical key set, so a key added to one and forgotten in the others renders as its own name in eight languages. `languageRecord` is the list the picker renders, and each entry carries the flag shown beside it: an SVG imported from [src/assets/flag/](src/assets/flag/), not a `flag-icons` class. That package was a dependency until its stylesheet's `url()` references pulled 3.8 MB of unreachable flags into `dist`; the ten committed here are the same MIT-licensed files, and adding a language means adding its flag next to them.
- **Theme** ([src/utility/theme.ts](src/utility/theme.ts)): writes `data-theme="light|dark"` on `<html>`; defaults to OS `prefers-color-scheme`.

Because these are singletons (not context), components read them at render (`getTheme()`, `getLanguage()`, `getDirection()`) and re-mount to reflect changes (e.g. the Swiper is keyed on `getLanguage().code`).

### Styling
Tailwind CSS 4 via `@tailwindcss/vite`, configured entirely in [src/assets/style.css](src/assets/style.css) (no `tailwind.config`). The design language is glassmorphism. Palette is **semantic CSS variables** in oklch, swapped wholesale by `[data-theme]`; `@theme inline` maps them to utilities. **Use the semantic tokens** (the `base-*`, `txt-*`, `btn-*`, `glass-*` families and the `tiny/small/medium/large/display` text scale) rather than raw colors. Animations use `motion/react` (Framer Motion).

**There are no component CSS classes.** The glass surfaces and button fills are class strings exported next to the components that own them — `glassPanel` in [panel.tsx](src/components/ui/panel.tsx), `glassInput` in [field.tsx](src/components/ui/field.tsx), the fills and the chip in [button.tsx](src/components/ui/button.tsx). Being ordinary utilities is what lets `cn()` resolve them against a call site's `className`; as unlayered CSS they silently outranked every utility, which is why an error colour passed beside a muted fill used to do nothing.

What is left in `style.css` is only what cannot be a utility on a React element: the `@theme` tokens and `[data-theme]` palettes, `@font-face`, the global `user-select` reset, the `:lang()` font switch, the password-reveal and scrollbar pseudo-elements, `.scroll-hidden`, `html`/`body`/`#root`, and the two Swiper overrides — the pagination bullets, and `.tab-strip .swiper-slide`, which sets the browser tab chip's width. Swiper renders that markup itself and ships `.swiper-slide { width: 100% }` from its own unlayered sheet, so those rules must stay unlayered too; set from a utility, every chip would span the strip and the list would show one tab at a time.

A colour belongs in `style.css` as a token pair, not on a call site.

**Tailwind scans `CLAUDE.md` too.** It auto-detects sources from the project root, so a class name written in prose here is generated into the bundle. Quote them sparingly.

### Shared UI kit
[src/components/ui/](src/components/ui/) holds the primitives every surface composes — `Button` (CVA variants over the fills defined in the same file; **every `<button>` in the app routes through it**, with `variant='bare'` for fully custom looks), `Text`, `Panel`, `TextField`/`PasswordField`/`ReadonlyField`, `Modal`/`ModalHeader`/`ModalBody`/`ModalActions`, `Sheet`/`SheetHeader`, `Alert`, `IconBox`, `Spinner`, `Checkbox`, `MenuRow`, `SectionHeader`, `EmptyState`, `Horizontal`/`Vertical`.

`Horizontal` and `Vertical` are the row and column, and they contribute nothing but the display and the direction — every other utility rides in through `className` exactly as it did on the `div` each one replaces. `Horizontal` states no direction because a row is what flex already defaults to. Reach for them for a layout container; a `div` that is positioned, scrolled, carries a `ref` or a handler, or builds its classes through `cn()` was deliberately left alone and should stay that way.

`Button`, `Text`, `Alert`, `Checkbox` and `EmptyState` take their content as a **`text` prop and self-close**; `children` is reserved for content that genuinely composes (an icon beside a label, a stacked icon and caption, a nav tab). Both render in the same slot and never combine. **All typography goes through `Text`** — its variants (`caption`, `captionStrong`, `body`, `bodyMuted`, `title`, `heading`) are the only size/colour pairings the design makes, so a size or a colour written inline is a smell. The exception is text that must inherit its colour from a fill it sits inside.

`Alert` renders nothing for an empty message, so `<Alert text={ error } />` needs no surrounding conditional. `Button` has two destructive fills that are not interchangeable: `danger` is muted with red text, for a remove control that has to sit quietly inside a list, and `destructive` is the filled red one, for an action that ends the session.

Shared feature rows live beside their domain: [token.row.tsx](src/components/token.row.tsx), [dashboard.transaction.tsx](src/components/dashboard/dashboard.transaction.tsx), [dashboard.nav.tsx](src/components/dashboard/dashboard.nav.tsx). **Platform safe-area padding is owned by `PageContainer` and the `inset` constants in [src/layout/container.tsx](src/layout/container.tsx)** — pick a variant (`tab`, `browser`, `intro`); no page hand-writes `env(safe-area-inset-*)` or an `isWindows` padding fork. Those formulas must stay literal class strings so Tailwind's scanner finds them.

### `cn()` and the class merge
[src/utility/cn.ts](src/utility/cn.ts) is self-contained: a class-value flattener plus a conflict resolver, with **no `clsx` and no `tailwind-merge` dependency**. `flattenValue` is the half `clsx` used to do and keeps its one rule — anything falsy is dropped wherever it appears, which is what makes `condition && 'class'` work and why a `0` from `list.length && 'class'` is discarded rather than emitted as a class named `0`. (`clsx` is still in `node_modules`; `class-variance-authority` depends on it. Nothing in `src/` imports it.) Which utility wins in the browser is decided by the order Tailwind wrote them into the stylesheet, not by the order they appear in the attribute, so a component default can beat the override a call site passed. `cn()` drops the loser, which is what makes "the last one wins" true.

The resolver knows the families this app uses and **keeps anything it does not recognise**, so an unlisted family fails safe (a stale class, never a missing one). Adding a new utility family that call sites need to override means adding its prefix to `groupList`. The `text-` prefix is special-cased because it spells both a size and a colour: the app's own scale has to be listed in `sizeMap` or a size and a colour look like the same property and one of them is silently dropped.

### Platform shells
Config is layered — [tauri.conf.json](src-tauri/tauri.conf.json) (base) plus `tauri.windows.conf.json`, `tauri.linux.conf.json` and `tauri.android.conf.json`, each declaring its **own** `main-capability` permission list. A permission added to one platform is absent on the others until added there too; only the desktop configs grant `fs:*`.

On Windows the app is **frameless** (`decorations: false`) and runs a custom [src/layout/titlebar.tsx](src/layout/titlebar.tsx) (drag region + min/max/close, close → `hide()` not quit) plus a system tray created in [app.tsx](src/app.tsx). Closing to the tray is why the single-instance plugin unminimizes and focuses the existing window rather than starting a second one. `useIsWindows()` ([src/hook/platform.ts](src/hook/platform.ts)) gates all of this and returns `false` outside Tauri.

## Conventions

- **ESLint is `all`-configs strict** ([eslint.config.ts](eslint.config.ts)): `@eslint/js` all + `typescript-eslint` all + `@stylistic` all + `better-tailwindcss`. Formatting is enforced by lint, not Prettier: **4-space indent, semicolons, single quotes (incl. JSX), Allman braces, no trailing commas, spacing inside `{ }`/`[ ]` and template `${ }`**. Match the surrounding style exactly.
- **Naming convention is enforced**: `variableLike` → camelCase, `function` → **PascalCase**, `typeLike` → PascalCase. React components and top-level functions are PascalCase by rule, not just convention.
- TypeScript is `strict` with `noEmit` (Vite/tsc split); bundler module resolution, `resolveJsonModule` on.
- JSDoc blocks are used liberally on exported utilities and components, and comments explain *why* — keep and extend them when editing.
- `src-tauri/` is excluded from tsconfig and eslint; its `target/` and parts of `gen/android/` are git-ignored.
- Commits follow **Conventional Commits** with a lowercase, imperative, ≤50-character subject (see [contributing.md](contributing.md)).

## Goals

### Tauri is the only target

**A plain web build is no longer an output.** This shipped as a goal for a long time — every remote path was written to degrade rather than depend on a native surface — and it is why `storage.ts` carried a `localStorage` backend behind `isTauri()`, why `getExporter()` could answer `undefined`, and why several modules still explain themselves in terms of "outside a Tauri window". That branch is gone: `isTauri()` is no longer called anywhere, storage opens `application.bin` unconditionally at module scope, and `npm run dev` in a plain tab therefore does **not** mount. Use `npm run desktop`.

What the goal left behind is mostly still right, and is not worth undoing on its own: the image cache in OPFS, `navigator.clipboard`, the plain `fetch`. A web API that does the job is still the simpler dependency, and reaching for a plugin is still a decision to justify rather than a default.

**What it does unlock** is `tauri-plugin-http`, which was tried twice and reverted twice purely because it tied a feature to Tauri. That objection is void. It would make favicons byte-cacheable and it would read the Nura explorer without waiting on that server's CORS headers (see *Known, unfixed*) — both are now a cost/benefit call rather than a rule. Nothing has been changed on the strength of it yet.

### One theme, everywhere

Every colour, size and surface comes from the tokens in [style.css](src/assets/style.css), so that flipping `data-theme` restyles the whole app and nothing is hand-painted.

**Hold the line here:**

- A size or colour written inline is a smell. Typography goes through `Text`, surfaces through `Panel` / `Button` / the field recipes.
- No literal colour outside `style.css`, and no new `.class` in `style.css` that could be a utility.
- Alphas on a token are fine; a second alpha for the same idea in a second place is not.

**Deliberate exceptions — do not "fix" these:**

- The QR code in [dashboard.receive.tsx](src/components/dashboard/dashboard.receive.tsx) is pure black on a white tile. Scanners need that contrast; a themed QR is an unscannable QR.
- The exported phrase PNG in [export.ts](src/core/export.ts) uses fixed hex. The file outlives the session that wrote it and should not change appearance with the app's theme.

Both exceptions are the reason this cannot be a lint rule — a hard ban on literal colours would flag them too.

### Known, unfixed

- **The Argon2id parameters are a broken compatibility contract.** Verification recomputes the hash with whatever [password.ts](src/core/password.ts) says today and compares it against one written under yesterday's constants, so a wallet created before they were raised past `m=32768 / t=2 / p=1` can no longer be unlocked. Fixing it properly means storing the parameters alongside the hash and verifying with the set the hash was written under, then re-hashing at the new cost after a successful unlock. Note that the encrypted-mnemonic payload in `storage.ts` has the same weakness and no version marker either, so a real fix covers both. Until then, treat these constants as frozen.
- **Nura's explorer sends no CORS headers, so the activity list is empty on the default network.** `explorer.nurachain.net/api` answers a `curl` with correct JSON and `200`, but carries no `Access-Control-Allow-Origin` and returns `405` to the preflight — so the webview fetches it, gets the body, and refuses to hand it to script. The tell is that balances work while history does not: `rpc.nurachain.net` beside it *does* send `ACAO: *`. **Nothing in [hook/history.ts](src/hook/history.ts) is wrong** — it already catches this and the UI already shows `Dashboard.Activity.Unavailable` rather than "no transactions". The fix is `add_header 'Access-Control-Allow-Origin' '*' always;` on that server plus a `204` for `OPTIONS`; the only client-side alternatives are `tauri-plugin-http` — no longer ruled out now that the web build is gone, see *Tauri is the only target* — or routing addresses through a third-party proxy, which is not a trade this app makes. Checked and ruled out: the node is go-ethereum with no `ots_*` and no `trace_filter`, `eth_getLogs` is capped at 10 000 blocks and covers token transfers only, and `/api/v2`, `/graphiql` and `/api/v1/graphql` are all 404. Verify a fix with `curl -sD- -o/dev/null -H "Origin: http://tauri.localhost" "https://explorer.nurachain.net/api?module=account&action=txlist&address=0x0"`. Note also that the chain had **no transactions in any block sampled from 1 to 311 284**, so test the pipeline against Ethereum, whose Blockscout does send the header and already works.
- **[storage.ts](src/utility/storage.ts) `await`s the store plugin at module scope.** A store file that cannot be opened rejects there, which leaves the module — and therefore the app — unresolved, with a blank window and no diagnostic. Everything downstream of it now survives its own failures (see *Offline, and the read caches*), but this one is upstream of all of it. A fix has to decide what to show when the wallet on disk cannot be read, and an empty in-memory store is not it: the app would open on the intro screen, and a user told there is no wallet may re-import over one that was only unreadable for a moment.
- The keydown listener in [app.tsx](src/app.tsx) matches a list of shortcuts and then does nothing — its `preventDefault()` is commented out.
