# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nura Wallet — a cross-platform (Windows, Linux, Android) Ethereum wallet built with **Tauri 2** (Rust shell) and a **React 19 + TypeScript + Tailwind CSS 4** frontend. Keys never leave the device: mnemonics are AES-GCM encrypted in the browser before being persisted, and the passphrase is hashed with Argon2id in the browser via WebAssembly.

The app is the repository root — `package.json`, `src/` and `src-tauri/` all sit at the top level, so every command below runs from there and CI needs no working directory of its own. It used to live one level down in `Application/`, which is worth knowing only because a stale checkout or an old link may still say so.

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

There is no test suite. `npm run build` runs `tsc` as the typecheck gate. Prefer `npm run desktop` over `npm run dev` for anything touching Tauri APIs (`@tauri-apps/*`, store, webview, platform) — those throw outside a Tauri window, and the browser tab in particular has no child-webview to paint into.

`package-lock.json` is committed and CI installs from it with `npm ci`. Releases are cut by pushing a `v*` tag: [.github/workflows/release.yml](.github/workflows/release.yml) builds every platform and attaches the renamed installers to a draft release. Twelve files, from four jobs:

- **windows** — `.exe` (NSIS), x64 only. Windows on ARM emulates x64, so a second toolchain would buy nothing. `tauri.windows.conf.json` restricts `targets` to `nsis`: the MSI it used to ship alongside was a second installer for the same machines, and dropping it at the staging step would still have paid for the WiX download and the extra bundling pass, so the target list is where it goes.
- **linux** — a matrix of two *natively* built architectures, x86_64 on `ubuntu-22.04` and aarch64 on `ubuntu-22.04-arm` (free for public repos), each bundling `.deb`, `.rpm` and `.AppImage`. That is the whole reachable set, not a shortlist: i386 has no `libwebkit2gtk` in Ubuntu's partial multiarch so it cannot link, and armhf has no runner — it would need either a cross sysroot for webkit or the emulated runner Tauri's docs suggest, which risks the six-hour job limit. The arch label differs per format on purpose (dpkg says `amd64`/`arm64`, rpm and AppImage say `x86_64`/`aarch64`).
- **android** — five APKs from **two** builds, because the shapes are mutually exclusive: plain `--apk` assembles the single `universal` flavour, and `--apk --split-per-abi` assembles the four single-ABI ones instead. Neither produces the other. The flavours come from `RustPlugin.kt` in the git-ignored `gen/android/buildSrc`, and their Gradle names (`arm64`, `arm`, `x86`, `x86_64`) are *not* the ABI names a phone reports — the collect step maps them to `arm64-v8a`/`armeabi-v7a`/`x86`/`x86_64` so a downloader can match the file to their device. The second build is cheap; it reuses the four Rust targets the first already compiled.
- **release** — needs all three, tag-only, draft.

Every job stages into `release-files/` under one `Nura-Wallet-<platform>-<arch>.<ext>` scheme rather than uploading from the bundle tree. The platform is spelled out because the arch alone does not identify a build — `x86_64` and `arm64` each name both a Linux package and an Android ABI — so the twelve assets only sort into three obvious groups once it is in the name. The **version is deliberately not in the filename**, so a download link reads the same at every release; the cost is that a saved file is anonymous, and the `version` job's tag check is therefore the only thing keeping the number honest. That job publishes no output — it is purely a gate the three build jobs wait on. Staging rather than uploading from the bundle tree has two reasons, both learned the hard way: `upload-artifact` roots its archive at the common ancestor of the search *paths*, so listing several bundle directories nests the files a level down and the release job's globs miss them; and Tauri names bundles after `productName`, which has a space in it that GitHub rewrites to a dot on the assets list. The staging directory must not be `dist` — that is Vite's output, and staging there attached `index.html` to a release.

A tagged Android build fails early unless `ANDROID_KEYSTORE` (+ password, alias, key password) is set, and fails late if Gradle produced an unsigned APK anyway — an unsigned APK cannot be installed, so shipping one wastes the tag.

## Architecture

### Two halves, thin native surface
The Rust backend ([src-tauri/src/](src-tauri/src/)) is deliberately minimal — it exposes **no commands at all**. [lib.rs](src-tauri/src/lib.rs) only registers plugins (single-instance and fs on desktop only, os and store everywhere) and the desktop tray handler. **There is no `http` plugin** — every request in the app goes through the webview's own `fetch`, which is what the SPA goal costs and what the explorer note under *Known, unfixed* is about. Everything — wallet derivation, password hashing, encryption, UI — lives in the frontend. New native capability means: add a `#[tauri::command]`, register it in an `invoke_handler` in [lib.rs](src-tauri/src/lib.rs), and add the matching permission to **each** per-platform capabilities block (see below).

Tauri is built with the **`unstable` feature**, which is what gates the multiwebview API. Without it `new Webview(...)` always fails and the browser tab silently degrades to an iframe.

### Frontend entry & the page bus
[src/app.tsx](src/app.tsx) is the root. `initTheme()`, `initLanguage()` and `initNetwork()` are awaited **at module scope** before `createRoot` — a rejection there leaves the module unresolved and the window blank, so anything added there needs its own failure surface. `Application` then picks the first page in an effect: `Wallet.Mnemonic` + `Wallet.Password` both present → `UnlockPage`, else `IntroPage`.

Navigation is **not** a router. It's a custom event bus ([src/utility/event.ts](src/utility/event.ts)) with a typed `EventMap`. `openPage(Component, props)` ([src/utility/context.tsx](src/utility/context.tsx)) emits `Page.Open` with a rendered element; [src/layout/page.tsx](src/layout/page.tsx) holds the single active page in state and swaps it (wrapped in `AnimatePresence`). There is one page at a time, no history/back stack. The same bus reserves `Toast.*` and `Modal.*` events. To navigate, import the target page component and call `openPage(...)` — don't reach for a router.

### Wallet core
[src/core/wallet.ts](src/core/wallet.ts) wraps `ethers` v6. `WalletManager` derives from a BIP39 mnemonic at `m/44'/60'/0'/0/{index}` (NFKD-normalized). `WalletManager.FromPrivateKey()` returns a `PrivateKeyWalletManager` with the **same public API** (`retrieve`/`sign`/`verify`/`toString`) so callers stay agnostic to the key source. Static helpers: `Generate`, `Validate`, `Verify`.

The dashboard owns the unlocked mnemonic and passes derived state down: [src/page/dashboard.tsx](src/page/dashboard.tsx) holds the active account (a derivation index), the account list, the active network and the live balances, then feeds all three tabs and every transfer modal from that one source.

### Storage & crypto boundary
[src/utility/storage.ts](src/utility/storage.ts) is the single persistence layer, over a four-call `Backend` interface — `get`/`set`/`delete`/`save`, deliberately the shape `@tauri-apps/plugin-store` already has, so the Tauri half *is* the plugin with nothing wrapped around it. Inside Tauri it loads `application.bin` eagerly at module scope, exactly as before; outside it (`isTauri()` is false) it is `localStorage` wearing the same shape, where `save` is a no-op because every write is already durable. Keys are constrained to the `StorageKey` union — `App.{Language,Theme,Network,Networks}`, `Wallet.{Mnemonic,Password,Name,Accounts,Active,Tokens}`, `Browser.{View,History,Favorites}`. Three plaintext accessors (`getValue`/`setValue`/`removeValue`), a batch `removeValues` (logout clears five keys in one file write, so the store either still has the wallet or has none of it), and an encrypted pair:

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

**Downloads use the plain `fetch` and no native surface** — this module has to run in an ordinary browser tab too (see *SPA portability*). The cost is CORS: reading response bytes requires `Access-Control-Allow-Origin`, which CDN logos send and **no site's favicon does**. So token and network logos cache; site icons cannot, throw in `download()`, and are never stored. When the cache returns empty the hook falls back to the raw URL and the `img` tag loads it directly — the icon still shows, and the webview's own HTTP cache handles the repeat. Routing this through `tauri-plugin-http` would make favicons cacheable and was tried; it was reverted because it ties the cache to Tauri.

`accepts()` requires an `image/*` content type **and** a recognised magic-byte signature, but deliberately does not require the two to name the same format: a `favicon.ico` is served as `image/x-icon` and is a PNG about as often as not.

### Hand-written Kotlin inside a generated directory
`src-tauri/gen/android/` is Tauri-generated but holds three hand-written files that are committed and must survive: [MainActivity.kt](src-tauri/gen/android/app/src/main/java/io/nurawallet/android/MainActivity.kt) (edge-to-edge transparent system bars, high-refresh-rate request, bridge registration), `BrowserBridge.kt`, and `ExportBridge.kt` (recovery-phrase export via MediaStore, which no webview can reach — desktop uses the fs plugin instead, see [src/core/export.ts](src/core/export.ts)). CI re-runs `tauri android init` to restore the git-ignored scaffolding; that has been verified to leave these byte-identical. Don't assume anything under `gen/` is disposable.

### i18n & theming (module singletons, not React context)
Both are plain modules holding mutable state, applied to `<html>` attributes, and persisted via storage:

- **Language** ([src/utility/language.ts](src/utility/language.ts)): `T('Dotted.Key', ...args)` resolves against a lazily `import()`-ed bundle in [src/assets/lang/](src/assets/lang/) (`en.json`, `fa.json`). Missing keys render as `[Dotted.Key]` so gaps are visible. `%s` tokens are replaced positionally. Sets `document.documentElement.lang` and `dir` (`fa`/`ar` → RTL). **Every user-facing string goes through `T()` and needs an entry in both `en.json` and `fa.json`.**
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

### SPA portability

A plain web build of this frontend is a wanted output, not just the Tauri shell. **Do not reach for a native surface when a web API can do the job**, and do not add a Tauri plugin to solve a problem the browser has an answer for — even a worse answer. Prefer the degraded-but-portable path and say what it costs.

This is why the image cache lives in OPFS rather than the `fs` plugin, why it downloads with the plain `fetch` and accepts that favicons cannot be byte-cached, why copying goes through `navigator.clipboard` rather than the clipboard plugin (which was a dependency until nothing imported it), and why anything platform-shaped (`useIsWindows`, the browser bridge, the export bridge) is behind a check that fails to `false` outside a Tauri window.

**The last hard blocker is gone.** `storage.ts` used to top-level-await the store plugin, which rejected in a plain tab and left the module — and therefore most of the app — unresolved, with a blank window and no diagnostic. It now picks a backend on `isTauri()` (see *Storage & crypto boundary*), so `npm run build` produces a bundle that mounts outside Tauri. What remains is degradation, not breakage: the tray, the frameless titlebar and the child webview are absent or fall back, which is what they are supposed to do.

**The standing cost** is CORS. Every request the app makes is a webview request from its own origin, so any host that does not send `Access-Control-Allow-Origin` cannot be read — favicons, and the Nura explorer (see *Known, unfixed*). A Tauri HTTP plugin would fix both and has been tried twice and reverted twice, because it ties the feature to Tauri and buys the web build nothing. Reach for the server's headers, not the plugin.

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
- **Nura's explorer sends no CORS headers, so the activity list is empty on the default network.** `explorer.nurachain.net/api` answers a `curl` with correct JSON and `200`, but carries no `Access-Control-Allow-Origin` and returns `405` to the preflight — so the webview fetches it, gets the body, and refuses to hand it to script. The tell is that balances work while history does not: `rpc.nurachain.net` beside it *does* send `ACAO: *`. **Nothing in [hook/history.ts](src/hook/history.ts) is wrong** — it already catches this and the UI already shows `Dashboard.Activity.Unavailable` rather than "no transactions". The fix is `add_header 'Access-Control-Allow-Origin' '*' always;` on that server plus a `204` for `OPTIONS`; there is no client-side fix that does not either add the HTTP plugin or route addresses through a third-party proxy. Checked and ruled out: the node is go-ethereum with no `ots_*` and no `trace_filter`, `eth_getLogs` is capped at 10 000 blocks and covers token transfers only, and `/api/v2`, `/graphiql` and `/api/v1/graphql` are all 404. Verify a fix with `curl -sD- -o/dev/null -H "Origin: http://tauri.localhost" "https://explorer.nurachain.net/api?module=account&action=txlist&address=0x0"`. Note also that the chain had **no transactions in any block sampled from 1 to 311 284**, so test the pipeline against Ethereum, whose Blockscout does send the header and already works.
- **[app.tsx](src/app.tsx) has no startup failure surface.** `initTheme()`, `initLanguage()` and `initNetwork()` are awaited at module scope, so a rejection leaves the module unresolved and the window blank with no diagnostic.
- The keydown listener in [app.tsx](src/app.tsx) matches a list of shortcuts and then does nothing — its `preventDefault()` is commented out.
