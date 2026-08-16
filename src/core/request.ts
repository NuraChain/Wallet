import { fetch as nativeFetch } from '@tauri-apps/plugin-http';

/**
 * The hosts read through the native HTTP client rather than the webview's own `fetch`.
 *
 * There is exactly one, and it is here for a server bug rather than a design: Nura's explorer sends
 * `Access-Control-Allow-Origin` twice. Repeated headers are joined before the CORS check, so the
 * webview reads `*, *`, decides that is not an origin it was granted, and `fetch` rejects with
 * `TypeError: Failed to fetch` — a duplicated header fails exactly as hard as an absent one. Nothing
 * in the response is wrong; the wallet is simply never allowed to look at it.
 *
 * `curl` implements no CORS and calls the same endpoint healthy, which is how the header was declared
 * fixed once already. Reproduce it from a page origin instead, alongside `rpc.nurachain.net` — which
 * sends one header and succeeds from that same origin — before concluding anything about this list.
 *
 * **This must match the `http:default` scope in all three capability blocks** ([windows](../../src-tauri/tauri.windows.conf.json),
 * [linux](../../src-tauri/tauri.linux.conf.json), [android](../../src-tauri/tauri.android.conf.json)):
 * a host named here and not granted there fails at the plugin instead of at CORS, which is the same
 * empty list by a longer route. A host granted there and not named here simply never uses it.
 *
 * It is deliberately not "every explorer". The native client answers to no origin policy at all, so
 * each entry is a host this app has decided to trust with an unmediated request, and Etherscan and
 * every other Blockscout send the header correctly and need nothing. When Nura's proxy drops its
 * duplicate copy, this list — and the plugin behind it — can go.
 */
const nativeHosts = new Set([ 'explorer.nurachain.net' ]);

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
 * The webview stays the default. Its request carries the origin, the CSP and the cookie rules, and a
 * wallet wants those on by default — the native client has none of them, which is precisely why it
 * works and precisely why it is spent only on the hosts listed above.
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
