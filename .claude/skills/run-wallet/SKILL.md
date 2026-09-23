---
name: run-wallet
description: Build, run, drive and screenshot Nura Wallet — the Vite web UI, the real Tauri desktop window, or the built browser extension. Use when asked to run or start the wallet, take a screenshot of a screen or dialog, reproduce a UI or extension bug, click through a flow (create or unlock a wallet, raise a dApp approval prompt), or build and test the app.
---

Nura Wallet is one React app shipped three ways: a Tauri window (desktop/Android/iOS), a browser
extension, and — for development — the Vite dev server. An agent drives all three with
`.claude/skills/run-wallet/driver.mjs`, a zero-dependency Chrome DevTools Protocol client (Node's
global `WebSocket` + whatever Chromium is on the machine). Paths are relative to the repo root.

Verified on Windows 11 (Git Bash + PowerShell), Node 24, the installed Chrome and Playwright's
Chromium 152, Rust/cargo 1.98. `node_modules` and `src-tauri/target` already existed; a fresh
clone needs `npm install` first (not re-run here).

## Run (agent path) — the driver

```bash
node .claude/skills/run-wallet/driver.mjs [options] <step> <step> ...
```

Steps run in order in one page. Screenshots land in `%TEMP%\nura-wallet-shots\<name>.png`
(`--out <dir>` to change). Exit code is non-zero on any failed step, and a failure prints the
page's own exceptions/console errors plus its URL and first 300 chars of HTML.

| Step | Does |
|---|---|
| `shot:<name>` | screenshot |
| `unlock` | web target only: unlocks a test vault (Hardhat's public `test … junk` mnemonic) and routes to the dashboard |
| `prompt:<fixture>` | raises a dApp approval: `send approve revoke transfer insecure sign typed connect chain-add chain-switch asset`, or a raw `DappPrompt` JSON |
| `clear` | rejects whatever prompt is up |
| `route:/path` · `lang:<code>` · `theme:<light\|dark>` | navigate · switch language (`fa`/`ar` are RTL) · switch theme |
| `press:<button label>` · `click:<css>` · `fill:<css>=<value>` | press a button by its text or aria-label · click · type into every match (React-safe) |
| `text:<css>` · `eval:<js>` | print an element's text · evaluate JS in the page (awaited, JSON printed) |
| `wait:<ms>` | sleep |

Options: `--size 360x640` (the Windows window size), `--theme`, `--lang`,
`--platform android|windows|…` (what plugin-os reports), `--seed <file.json>` (extra store keys),
`--headed`, `--keep` (leave the dev server running).

### Web UI (default target)

Starts `npm run dev` itself if port 1420 is free, and stops it afterwards. The Tauri IPC is faked
in-page: `plugin:store` is an in-memory Map, `plugin:os` reads `__TAURI_OS_PLUGIN_INTERNALS__`,
everything else rejects — so balances and prices show their offline state. Every screen renders.

```bash
node .claude/skills/run-wallet/driver.mjs shot:intro unlock shot:dashboard prompt:approve shot:approve 'eval:document.querySelector("[role=dialog] h2")?.innerText'
node .claude/skills/run-wallet/driver.mjs --theme dark --lang ar unlock prompt:send shot:send-dark-ar
```

Tracked tokens change what the approval dialog can say ("Send 125 USDT" instead of "Send
tokens"), so seed them:

```bash
echo '{"Wallet.Tokens":"{\"1020\":[{\"address\":\"0xdAC17F958D2ee523a2206206994597C13D831ec7\",\"symbol\":\"USDT\",\"name\":\"Tether USD\",\"decimals\":6,\"coinId\":\"tether\"}]}"}' > "$TEMP/seed.json"
node .claude/skills/run-wallet/driver.mjs --seed "$TEMP/seed.json" unlock prompt:transfer shot:transfer
```

Steps that import app modules by URL (`import("/core/session.ts")`) reach the app's own module
instances, because Vite serves each module once per URL:

```bash
MSYS_NO_PATHCONV=1 node .claude/skills/run-wallet/driver.mjs unlock 'eval:import("/core/session.ts").then(m => m.lockSession()).then(() => "locked")' wait:1200 'eval:document.querySelector("h1,h2")?.innerText'
```

### Browser extension

```bash
npm run extension
node .claude/skills/run-wallet/driver.mjs --extension dist-extension/chrome 'press:Create New Wallet' 'fill:input[type=password]=correct-horse' 'click:[role=checkbox]' 'press:Create Wallet' wait:4000 shot:ext-dashboard
```

Loads the unpacked Chrome build into Playwright's Chromium and opens
`sidepanel.html?window` (`--page popup.html` for the popup). Real `chrome.storage`, real Argon2,
real worker — a fresh profile each run, so it starts at the intro screen. The idle lock can be
forced from the page: `'eval:chrome.storage.session.remove("Session")'` is exactly what the
worker's 15-minute alarm does.

### Real desktop app (Tauri, Windows)

```bash
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 npm run desktop   # run in the background; ~2 min incremental build, and the driver waits up to 2 min for the port
node .claude/skills/run-wallet/driver.mjs --attach 9222 shot:desktop 'eval:({ url: location.href, tauri: typeof window.__TAURI_INTERNALS__?.invoke })'
```

Stop it (the dev server and `tauri dev` exit with it):

```powershell
Get-Process NuraWallet -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
```

**Attach mode is the user's real wallet**: `tauri dev` uses the installed app's identifier, so its
store is the one on disk. The driver refuses `unlock` there (a test vault would let token discovery
write into the real token list); unlock with the real password or stay on read-only steps.

## Run (human path)

`npm run desktop` opens the window; Ctrl-C in its terminal or close the window to stop.
`npm run dev` alone serves the UI at http://localhost:1420 but, outside Tauri, storage calls fail
and the app stays on its first screen — use the driver, which fakes them.

## Build and test

```bash
npm test                      # vitest, 4 files / 63 tests (dApp provider + calldata)
npx tsc --noEmit -p .         # app types
npm run -s extension:types    # extension types (its own tsconfig)
npm run extension             # all four stores into dist-extension/
npm run -s extension:lint     # web-ext over the Firefox build: 0 errors, 3 known innerHTML warnings
```

`npm run lint` currently exits non-zero on a pre-existing `src/layout/webview.tsx:43`
`prefer-math-min-max` error; lint the files you touch with `npx oxlint <files>`.

## Gotchas

- **Git Bash rewrites leading-slash arguments.** `eval:import("/core/session.ts")` arrives as
  `C:/Program Files/Git/core/session.ts` and `route:/unlock` as a Windows path. Prefix the command
  with `MSYS_NO_PATHCONV=1` whenever a step contains `/…`.
- **Branded Chrome ignores `--load-extension`** (since v137). `--extension` therefore prefers
  Playwright's Chromium from `%LOCALAPPDATA%\ms-playwright`; set `BROWSER=` to override.
- **Chromium runs its own component extensions, some with a `background.js` worker** (e.g.
  "Contextual Tasks"). Picking the first `chrome-extension://…/background.js` target opens the wrong
  extension and every page 404s ("Your file couldn't be accessed"); the driver asks each worker
  for `chrome.runtime.getManifest().name` and matches the build's `manifest.json`.
- `new URL('chrome-extension://id/x').origin` is the string `"null"` in Node — take the prefix.
- On Windows the headless profile stays locked briefly after the browser is killed; cleanup
  ignores the `EPERM`, so an occasional `%TEMP%\nura-driver-*` folder may linger.
- `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` turns on CDP for the Tauri window without editing
  `tauri.windows.conf.json`. A previous session found that remote debugging stops WebView2 from
  creating the in-app browser's child webviews — not re-verified here, but don't debug browser
  tabs through attach mode.
- `plugin:os|platform` is not an IPC command — plugin-os reads the platform synchronously off
  `__TAURI_OS_PLUGIN_INTERNALS__`, which is why the fake sets that global.
- **The extension's worker is evicted after ~30s without events.** While an approval is standing,
  `extension/platform.ts` pings `chrome.runtime.getPlatformInfo()` every 20s to hold it; if you
  change that path, re-test with a dApp tab on an `http://localhost` page (the content script
  injects there), `window.ethereum.request({ method: 'eth_requestAccounts' })`, and a 60s wait
  before answering — the worker target should still be in `/json/list`.
- The built extension is a bundle: `unlock`, `prompt:` and `import("/…")` steps only work where
  Vite serves modules (web target, and the desktop app in `tauri dev`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Failed to fetch dynamically imported module: file:///C:/Program%20Files/Git/…` | `MSYS_NO_PATHCONV=1` |
| `timed out waiting for the app to render` with `[page] state: chrome-error://…` in extension mode | `npm run extension` first; the driver loads `dist-extension/chrome` as built |
| `unlock fakes a vault and is web-only` | you are attached to the real app; unlock it by hand |
