import { fetch as nativeFetch } from '@tauri-apps/plugin-http';

/**
 * The hosts read through the native HTTP client rather than the webview's own `fetch`.
 *
 * These are the app's own API endpoints — the explorers behind the history and token lists, the price
 * feed, and the GoldRush fallback — and they are read by Rust, where there is no origin, no preflight
 * and no CORS check to pass. Nura's explorer is why the path exists at all: it sends
 * `Access-Control-Allow-Origin` twice, repeated headers are joined before the check, so the webview
 * reads `*, *`, decides that is not an origin it was granted, and `fetch` rejects with
 * `TypeError: Failed to fetch` — a duplicated header fails exactly as hard as an absent one. Nothing
 * in the response is wrong; the wallet is simply never allowed to look at it.
 *
 * The rest are here because a wallet should not need a third party's header to be correct in order to
 * show a balance. They answer the browser today; that is a courtesy each of them can withdraw in a
 * deploy nobody here is told about, and the failure it produces — an empty history, a missing price —
 * looks like an empty account rather than a refused request. Reading them natively removes that
 * dependency instead of waiting to discover it.
 *
 * `curl` implements no CORS and calls Nura's endpoint healthy, which is how its header was declared
 * fixed once already. Reproduce from a page origin instead, alongside `rpc.nurachain.net` — which
 * sends one header and succeeds from that same origin — before concluding anything about this list.
 *
 * **This must match the `http:default` scope in all three capability blocks** ([windows](../../src-tauri/tauri.windows.conf.json),
 * [linux](../../src-tauri/tauri.linux.conf.json), [android](../../src-tauri/tauri.android.conf.json)):
 * a host named here and not granted there fails at the plugin instead of at CORS, which is the same
 * empty list by a longer route. A host granted there and not named here simply never uses it.
 *
 * It stays a list and does not become a wildcard. The native client answers to no origin policy at
 * all, so each entry is a host this app has decided to trust with an unmediated request, and granting
 * `https://*` would hand that same trust to every address a user can type into a custom network or the
 * browser tab. Those keep the webview and its rules, below.
 */
const nativeHosts = new Set([
    'explorer.nurachain.net',
    'eth.blockscout.com',
    'api.etherscan.io',
    'api.coingecko.com',
    'api.covalenthq.com'
]);

/**
 * hostOf - The host of an absolute URL.
 *
 * Anything that will not parse resolves to no host, which routes it to the webview: an unparseable
 * address is not one of the entries above, and `fetch` is the client whose failure the callers were
 * written around.
 * @param {string} url The URL to read.
 * @returns {string} The lowercased host, or an empty string.
 */
const hostOf = (url: string) =>
{
    try
    {
        return new URL(url).host.toLowerCase();
    }
    catch
    {
        return '';
    }
};

/**
 * httpRequest - One HTTP read, made by whichever client can actually complete it.
 *
 * A drop-in for `fetch` and deliberately shaped as one: it resolves to the same `Response` and rejects
 * the same way, so a caller reads `ok`, `status` and `json()` without knowing which side of the IPC
 * answered. That is what keeps the choice a single line in this file rather than a branch at every
 * call site.
 *
 * The webview stays the client for everything not named above, and that is not a leftover. A custom
 * network's explorer is an address the user typed, and the RPC beside it is another; neither can be in
 * a capability scope fixed at build time, and neither has earned an unmediated request. Their reads
 * carry the origin, the CSP and the cookie rules — the native client has none of them, which is
 * precisely why it works for the hosts above and precisely why it is spent only on those.
 * @param {string} url The absolute URL to read.
 * @param {RequestInit} [init] Standard fetch options, passed through unchanged.
 * @returns {Promise<Response>} The response, from the native client for a listed host and from the webview otherwise.
 */
export const httpRequest = async(url: string, init?: RequestInit): Promise<Response> =>
{
    if (nativeHosts.has(hostOf(url)))
    {
        return nativeFetch(url, init);
    }

    return fetch(url, init);
};
