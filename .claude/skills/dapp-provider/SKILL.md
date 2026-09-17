---
name: dapp-provider
description: Use for anything in the dApp provider path — an EIP-1193 method, the injected page script, the bridge, approval prompts, connection grants, provider events, or the transports under them (Rust dapp_request, the extension port, Android's Kotlin). Covers src/core/dapp*.ts and their tests. Read before adding an RPC method, touching origin handling, or changing what a page is allowed to do.
---

# The dApp provider

A third-party page asks; the wallet answers. Every file below exists to keep that sentence
true in one direction only — the page never reaches the wallet's own capabilities, and never
gets to say who it is.

```
page  →  dapp.script.ts (injected, in the page)
      →  transport (Rust dapp_request | extension port | Kotlin)
      →  dapp.bridge.ts (parse, validate, stamp origin)
      →  dapp.rpc.ts   answerDapp() → route()
      →  dapp.prompt.ts (ask the user)  /  chain RPC (read methods)
```

## The one rule that is not negotiable

**Origin is stamped by the transport and never read from the payload.** On desktop Rust
takes it from the webview's own URL; in an extension it comes off the port's sender. The
bridge then runs it through `siteOrigin()`, which returns `''` for anything that is not
`http:` or `https:`. `route()` refuses an empty origin outright.

A page that could name its own origin could spend another site's grants. If a change makes
origin arrive from anywhere else, it is wrong regardless of what it fixes.

## `dapp.ts` — vocabulary and grants

`DappEnvelope { id, label, origin, method, params }` in, `DappReply { id, result? , error? }`
out. `label` is the page/webview; `origin` is the security identity.

Errors are `DappError` via `failure(code, message, data?)`, with `dappError` holding the
codes a dApp expects: `rejected` 4001, `unauthorized` 4100, `unsupported` 4200,
`disconnected` 4900, `chainMissing` 4902, plus the JSON-RPC negatives. **Use the constants**
— a wallet that invents a code breaks the page's own error handling.

Connection grants are a list of origins in `Browser.Connections`, held in a module variable
and reachable through `isConnected` / `grantConnection` / `revokeConnection` /
`clearConnections`. `loadConnections()` rehydrates it — fired from the dashboard on mount, awaited in the
extension worker's boot beside `initNetwork()`. A grant is per origin, not per tab.

## `dapp.script.ts` — the injected provider

`dappScript(identity)` returns the provider **as a string**; it is injected, not imported, so
it is plain ES5-ish JS with no build step around it and no access to anything in `src/`. The
sentinel `window.__nuraWallet` makes a second injection a no-op.

`dappIdentity(chainId, channel)` carries `rdns: 'net.nurachain.wallet'` for EIP-6963 and a
`channel` of `'native' | 'extension'` that is **decided at build time, not sniffed**. Do not
add feature detection to work out which host it is in.

## `dapp.bridge.ts` — the only thing that parses page input

`startDappBridge(handler, onLink)` replaces any previous bridge, then for each call:
bad JSON → `-32700`, a shape that is not an envelope → `-32600`, and a handler that rejects
→ `-32603`. **Nothing from a page is allowed to throw past this file.** It also keeps the
`label → origin` map behind `getDappPages()`, which is what lets an account or chain change
be pushed to exactly the pages entitled to hear it, via `emitDappEvent`.

`onLink` is a navigation the webview cannot load, handed over rather than left dead.

## `dapp.rpc.ts` — policy

`answerDapp(envelope)` is the only entry point, and it never throws: `route()` throws, and
`describe()` turns whatever came out into a `DappFailure`.

Three gates, in this order:

1. `origin.length === 0` → 4100. The page is not servable at all.
2. `requireGrant(origin)` → 4100 unless the origin is connected **and** the wallet is
   unlocked. Locked is unauthorized, not disconnected.
3. `approve({ kind, origin, summary, ... })` → throws 4001 when the user says no. Every
   `connect`, `signature`, `typed`, `transaction`, `chain` and `asset` goes through it.

Anything not handled explicitly falls to `readMethods` — an **allowlist** of read-only
`eth_*` calls forwarded to the chain's own RPC (with `rpcBackups` as fallback). A method
that is not in it answers 4200. Adding a method to that set means deciding it leaks nothing
and costs nothing; adding a write method there instead of giving it a `case` is a bug.

## `dapp.prompt.ts` — the approval queue

`DappPrompt` is the serialisable description of a question. The queue exists in this shape
because in an extension the context that *asks* has no UI: the worker owns the pending
resolvers (a resolver cannot be serialised), publishes the list through
`platform.approval.publish`, and whatever window is open answers by id. In a Tauri window
the same code runs with the platform hooks inert. Keep new prompt data inside `DappPrompt`
and serialisable — a callback in there works on desktop and silently breaks the extension.

## `dapp.log.ts`

`dappLog(scope, message, detail?)`, off unless `import.meta.env.DEV` or
`localStorage['nura.debug.dapp'] === '1'`. Call sites pass identifiers — id, method, origin,
label, code — never payloads. The `forbidden` regex is a second line of defence, not
permission to hand it a secret. See the `wallet-security` skill.

## Tests

`dapp.bridge.test.ts`, `dapp.rpc.test.ts` and `dapp.script.test.ts` are the only tests in the
tree, and they are here because this is where a regression is expensive and invisible.
`npm test` (vitest, node environment). **A change to routing, origin handling or the
injected script updates them in the same commit.**

## Checklist

1. Does the page decide anything it should not — origin, identity, channel? Then no.
2. New method: does it need a grant? a prompt? Is it read-only enough for `readMethods`?
3. Does every failure path produce a `dappError` code a dApp recognises?
4. Does the new prompt field survive `JSON.stringify` across a worker boundary?
5. Do the tests still describe what the code now does?
