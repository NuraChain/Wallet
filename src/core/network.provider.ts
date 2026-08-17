import { FallbackProvider, JsonRpcProvider, type AbstractProvider } from 'ethers';

import { getNetwork, getNetworkRevision } from './network';

/**
 * The RPC provider, kept in its own module because of what it imports.
 *
 * `ethers` is by far the largest dependency in the bundle — around 370 KB minified once `aes-js`,
 * `@adraffy/ens-normalize` and the `@noble` primitives it pulls in are counted. This used to live in
 * [network.ts](network.ts), which [app.tsx](../app.tsx) imports for `initNetwork` at startup, so the
 * whole crypto stack was parsed before the first frame could be painted — to read a stored network id
 * out of a file.
 *
 * Nothing on the launch path needs a provider. The three callers (the balance hook, token reads, and
 * the send flow) are all behind the unlocked dashboard, so splitting the module lets the bundler keep
 * `ethers` out of the entry chunk entirely and load it with the dashboard instead.
 *
 * Keep it that way: importing this module from anything that runs before unlock puts `ethers` back on
 * the startup path, and nothing will fail loudly when it happens — the app will just start slower.
 *
 * RPC stays on the webview's `fetch`, which is what `ethers` reaches for on its own. It is the one
 * remote read in the app not routed through [request.ts](request.ts), and deliberately: the endpoint
 * is whatever the active network names, every custom network carries an address the user typed, and a
 * capability scope is fixed at build time — so the native client could only cover them behind a
 * `https://*` grant that would cover everything else with them. The endpoints that ship also have no
 * CORS problem to solve; `rpc.nurachain.net` and the public nodes beside it all answer the origin.
 *
 * Routing this would also mean replacing the transport underneath `ethers` — `FetchRequest`, and with
 * it the retry, backoff and timeout the provider is built on. That is a rewrite of how the wallet
 * talks to a chain, which is not what a transport change should cost.
 */
let providerCache: { id: string; revision: number; provider: AbstractProvider } | undefined;

/**
 * Build (and memoize) a provider for the active network, over every endpoint it lists.
 *
 * The provider is cached per network id, so switching networks and switching back does not leak a new provider each time. `staticNetwork` skips the `eth_chainId` round-trip on every call.
 *
 * With more than one endpoint the calls go through a `FallbackProvider` at **quorum one**: the first
 * endpoint to answer wins and the rest are only reached for if it does not. That is failover, and it is
 * not the default — left alone, a fallback provider wants two endpoints to agree before it believes
 * anything, which doubles every request and fails outright when only one is reachable, the very
 * situation this exists for.
 *
 * Priority follows the order the endpoints are listed, so the first is the one normally used and the
 * others are the ones tried when it stalls.
 * @returns {AbstractProvider} Provider bound to the active network.
 */
export const getProvider = () =>
{
    const network = getNetwork();
    const revision = getNetworkRevision();

    // The revision is half the key, not a nicety: adding a custom network replaces the entry under the
    // same id, so an id-only match would keep returning a provider aimed at the endpoint it replaced.
    if (providerCache?.id === network.id && providerCache.revision === revision)
    {
        return providerCache.provider;
    }

    const endpoints = [ network.rpcUrl, ...network.rpcBackups ?? [] ].map((url) => url.trim()).filter((url) => url.length > 0);

    const single = (url: string) => new JsonRpcProvider(url, network.chainId, { staticNetwork: true });

    const provider: AbstractProvider = endpoints.length > 1 ?
        new FallbackProvider(endpoints.map((url, index) => ({ provider: single(url), priority: index + 1, weight: 1, stallTimeout: 1500 })), network.chainId, { quorum: 1 }) :
        single(endpoints[0] ?? network.rpcUrl);

    providerCache = { id: network.id, revision, provider };

    return provider;
};
