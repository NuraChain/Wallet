---
name: extension
description: Use for the browser-extension target and the platform seam it hangs off — anything in extension/, vite.config.extension.ts, tsconfig.extension.json, the generated MV3 manifest, the worker/content/inpage bundles, the side panel, or src/platform/. Read before adding a capability that differs between a Tauri window and an extension, a permission or host to the manifest, or a fourth bundle.
---

# The extension target

The same `src/` app ships twice. Which host it is running inside is a **build-time**
decision, never a runtime sniff.

```
npm run extension       # extension:types, then vite build --app -c vite.config.extension.ts
npm run extension:lint  # web-ext lint over dist-extension/firefox
```

## The platform seam — `src/platform/`

`src/platform/index.ts` re-exports `platform` from the bare specifier `#platform-impl`, and
the alias decides the file:

| Build | `#platform-impl` |
|---|---|
| `vite.config.ts` (Tauri) | `src/platform/tauri.ts` |
| `vite.config.extension.ts` | `extension/platform.ts` |
| `tsconfig.extension.json` `paths` | `extension/platform.ts` |

Importing the module rather than the file is what keeps one build from pulling in the
other's dependencies. **Nothing in `src/` may import either implementation directly**, and
nothing may branch on the host to decide behaviour — that is what the interface is for.

`src/platform/type.ts` is the contract: `storage`, `session`, `approval`, `dapp`, `panel`,
`host`, `fetch`, `openUrl`, `exporter`. Its doc comments explain *why* each member exists,
which is almost always "a Tauri window can do this in one place and an extension cannot".
Adding a capability means: add it to the interface, implement it in **both** files, and make
the inert side genuinely inert rather than a throw.

## Why the extension needs the seam at all

A Tauri window is one long-lived process that asks a question and draws it. An extension is
not:

- **The worker is evicted after about thirty seconds idle.** The unlocked vault cannot live
  in a module variable, so `extension/platform.ts` keeps it in `chrome.storage.session` —
  the one store held in memory, never written to disk, cleared when the browser closes, and
  hidden from content scripts at the default access level — under a deadline
  (`idleMinutes = 15`) rather than a process lifetime.
- **The context that asks has no UI.** Prompts are published as serialisable
  `DappPrompt`s for whatever window is open to render, and answered by id. See the
  `dapp-provider` skill.
- **A popup is dismissed the moment it loses focus.** `platform.panel` opens the browser's
  own docked frame (`sidepanel.html`) instead, which is the same app under a document that
  fills its frame. `panel.open()` may not await anything — both engines refuse a panel that
  is not opened straight out of a user gesture.

## Four bundles, and why each is the format it is

`vite.config.extension.ts` declares four environments. The `single()` helper pins one input,
one chunk, an unhashed name, `codeSplitting: false` — because the manifest names these by a
fixed path and **rolldown will not emit an IIFE made of more than one chunk.**

| Environment | Format | Why |
|---|---|---|
| `client` | normal app build | `popup.html` + `sidepanel.html` as two inputs of **one** build, so they share chunks instead of each carrying a copy of the wallet |
| `background` | **ESM** | `ethers` and the storage graph put top-level await in it; a classic script cannot hold that |
| `content` | **IIFE** | content scripts are classic scripts in every engine — `import` throws |
| `inpage` | **IIFE** | same, and it is read by pages whose own CSP forbids eval |

`buildApp` runs `client` first because it is the one that empties the directory the other
three append to. Then `emitTargets` fans the single build out.

Browser floor is `['chrome116', 'firefox115', 'safari16.4']`; chrome116 is the `sidePanel.open`
floor, so the other engines' real floor is lower.

## One build, four stores — `extension/emit.ts`, `extension/manifest.ts`

Targets are `chrome | edge | firefox | safari`. Each gets a copy of `dist-extension/build`
under `dist-extension/<target>/` with `buildManifest(target)` written into it. The HTML moves
up from the path Vite built it under to the root the manifest names; its asset URLs are
absolute, so it does not care.

Things in `manifest.ts` that are load-bearing:

- **`world: 'MAIN'` only for the Chromium targets.** It landed in Chrome 111, Firefox 128 and
  Safari 18, and an engine that does not know the key ignores *the key*, not the entry —
  which would quietly run the provider in the isolated world where no page can see it.
  Firefox and Safari get the script tag `content.ts` writes instead, guarded by the same
  `data-nura-inpage` sentinel.
- **`knownHosts` is only what the app ships with.** Chains and RPCs a user adds later are
  covered by the optional wildcard, so the install prompt stays small.
- **`'wasm-unsafe-eval'` is not optional** — hash-wasm compiles the Argon2id that unlocks the
  vault. Without it the wallet cannot open at all. `default-src` stays exactly `'self'`.

## The page ↔ worker path — `extension/message.ts`, `content.ts`, `background.ts`

Page world → relay is `window.postMessage` tagged `__nura`. Relay → worker is a port named
`nura:provider`, one per frame, opened on the frame's first call. Replies ride the port back;
events arrive as a plain runtime message.

`content.ts` is the isolated half: **it holds nothing and decides nothing.** The origin is
never read there — the worker takes it off `port.sender`, which only the browser can write.
It also guards on `chrome.runtime?.id === undefined`, because after an extension reload the
old context is dead and connecting through it throws, which would leave every page that ever
loaded it spinning forever.

## Checklist

1. Does the change belong in `Platform`, or is it host-specific detail that should stay
   behind it?
2. Implemented in **both** `src/platform/tauri.ts` and `extension/platform.ts`?
3. Does anything now assume a process that outlives a request? The worker does not.
4. New prompt or session data — does it survive `JSON.stringify`?
5. New permission or host in the manifest: narrowest that works, and is it really needed on
   all four targets?
6. `npm run extension` and `npm run extension:lint` both clean.
