import { fetch as nativeFetch } from '@tauri-apps/plugin-http';

/**
 * httpRequest - One HTTP read, made by the native client.
 *
 * A drop-in for `fetch` and deliberately shaped as one: it resolves to the same `Response` and rejects
 * the same way, so a caller reads `ok`, `status` and `json()` without knowing which side of the IPC
 * answered. That is what keeps the transport a single line in this file rather than a branch at every
 * call site.
 *
 * The request is made by Rust, where there is no origin and no preflight, so nothing read through here
 * depends on a server's CORS header being right. Nura's explorer is why that was needed at all — it
 * sends `Access-Control-Allow-Origin` twice, repeated headers are joined before the check, so the
 * webview reads `*, *`, decides that is not an origin it was granted, and `fetch` rejects with
 * `TypeError: Failed to fetch`. A duplicated header fails exactly as hard as an absent one. Nothing in
 * the response is wrong; the wallet is simply never allowed to look at it.
 *
 * **Every host is reachable from here.** The `http:default` scope in all three capability blocks
 * ([windows](../../src-tauri/tauri.windows.conf.json), [linux](../../src-tauri/tauri.linux.conf.json),
 * [android](../../src-tauri/tauri.android.conf.json)) grants `http://*` and `https://*`, which is what
 * lets a custom network's explorer — an address the user typed, unknowable at build time — read the
 * same way the built-in ones do. It replaced a per-host list, and that was a real trade rather than a
 * tidy-up: the list was the thing standing between a compromised dependency and an origin-free,
 * cookie-free client aimed at any address on the internet. Narrow it back to named hosts here and in
 * those three files together if that ever looks like the wrong side of the trade.
 *
 * Note what is still not reachable: `main-capability` sets no `remote` block and `local` defaults to
 * true, so it applies to this app's own frontend only. Pages opened in the browser tab are remote URLs
 * and get none of it, whatever this scope says.
 *
 * There is now exactly one command a visited page *can* reach, and it is not this one. The in-app
 * wallet provider needs a way in from a dApp, so `browser-capability` grants `dapp_request` — and only
 * that — to remote URLs in the browser's own webviews. It carries no HTTP scope and no other command,
 * so nothing a page does through it reaches this client.
 *
 * Two reads deliberately stay on the webview's own `fetch` — the image cache in [image.ts](image.ts)
 * and the RPC transport inside `ethers`, noted in [network.provider.ts](network.provider.ts). Neither
 * is about permission; see those files for why.
 * @param {string} url The absolute URL to read.
 * @param {RequestInit} [init] Standard fetch options, passed through unchanged.
 * @returns {Promise<Response>} The response, from the native client.
 */
export const httpRequest = async(url: string, init?: RequestInit): Promise<Response> => nativeFetch(url, init);
