import { FallbackProvider, JsonRpcProvider, type AbstractProvider } from 'ethers';

import { setValue, getValue } from '../utility/storage';

/**
 * A single EVM network the wallet can talk to.
 *
 * `custom` marks user-added networks, which are the only ones that can be removed. `explorerApi` is the Etherscan-compatible endpoint used for transaction history; when it is absent the explorer's own `/api` path is assumed.
 */
export interface Network
{
    id: string;
    name: string;
    chainId: number;
    symbol: string;
    /**
     * Display name of the native coin, when it differs from the chain's own name.
     *
     * "Nura Chain" is the network; "Nura Coin" is the thing you hold on it. Left unset the chain name
     * stands in, which is what the other built-ins want anyway.
     */
    coin?: string;
    rpcUrl: string;
    /**
     * Further RPC endpoints for the same chain, tried in order when the one before it does not answer.
     *
     * A public endpoint is not a dependency anyone controls: it can rate-limit, start asking for a key
     * or simply stop resolving, and a wallet with one of them configured shows no balance at all when
     * that happens. Kept separate from `rpcUrl` rather than folded into a list so that a custom network
     * stored before this existed still reads back correctly.
     */
    rpcBackups?: string[];
    explorerUrl: string;
    explorerApi?: string;
    /**
     * Key sent as `apikey` with every explorer call, for the explorers that demand one.
     *
     * Blockscout asks for nothing, so the built-in chains that use it leave this unset. Etherscan and
     * the explorers folded into it — BscScan among them — reject an unkeyed call outright.
     */
    explorerKey?: string;
    decimals: number;
    custom: boolean;
}

/**
 * Built-in networks shipped with the app. These can never be removed.
 *
 * Nura Chain leads the list, which also makes it the network a fresh install starts on.
 */
export const defaultNetworks: Network[] =
[
    {
        id: 'nura',
        name: 'Nura Chain',
        chainId: 1010,
        symbol: 'NC',
        coin: 'Nura Coin',
        rpcUrl: 'https://rpc.nurachain.net',
        explorerUrl: 'https://explorer.nurachain.net',
        explorerApi: 'https://explorer.nurachain.net/api',
        decimals: 18,
        custom: false
    },
    {
        id: 'ethereum',
        name: 'Ethereum',
        chainId: 1,
        symbol: 'ETH',
        // Ordered by what actually answered when this list was set: `publicnode` and `drpc` both
        // replied in under a second, `llamarpc` did not resolve at all and `ankr` now returns
        // Unauthorized without a key. The last two are kept as trailing fallbacks — they cost nothing
        // while the ones above them answer, and either may come back.
        rpcUrl: 'https://ethereum.publicnode.com',
        rpcBackups: [ 'https://eth.drpc.org', 'https://cloudflare-eth.com', 'https://eth.llamarpc.com', 'https://rpc.ankr.com/eth' ],
        explorerUrl: 'https://etherscan.io',
        explorerApi: 'https://eth.blockscout.com/api',
        decimals: 18,
        custom: false
    },
    {
        id: 'bnb',
        name: 'BNB Smart Chain',
        chainId: 56,
        symbol: 'BNB',
        rpcUrl: 'https://bsc-dataseed.binance.org',
        rpcBackups: [ 'https://bsc-rpc.publicnode.com', 'https://bsc.publicnode.com' ],
        explorerUrl: 'https://bscscan.com',
        // BscScan's API, at the address BscScan itself now publishes: its V1 host is retired and
        // answers every call with a migration notice, and the `/api` path guessed from the explorer
        // URL replies "Invalid API URL endpoint". Etherscan's own chain list gives this URL for chain
        // 56, so it is the one that reaches BscScan's data.
        //
        // It needs `explorerKey`, and a plan that covers this chain: unkeyed, and on the free tier,
        // it answers "Free API access is not supported for this chain". Until a key is set the history
        // list stays empty, which is what it already did — but it now fails at the right address.
        explorerApi: 'https://api.etherscan.io/v2/api?chainid=56',
        decimals: 18,
        custom: false
    }
];

let customNetworks: Network[] = [];
let networkCurrentId: string = defaultNetworks[0].id;
let providerCache: { id: string; provider: AbstractProvider } | undefined;

/**
 * Return every known network: the built-in ones followed by user-added ones.
 * @returns {Network[]} All selectable networks.
 */
export const getNetworks = () => [ ...defaultNetworks, ...customNetworks ];

/**
 * Return the active network, falling back to the first built-in one if the stored id is unknown.
 * @returns {Network} The active network.
 */
export const getNetwork = () => getNetworks().find((item) => item.id === networkCurrentId) ?? defaultNetworks[0];

/**
 * Resolve the Etherscan-compatible API base for a network.
 *
 * Built-in networks carry an explicit endpoint. For a custom network the explorer's own `/api` path is assumed, which is what a Blockscout instance exposes — if the guess is wrong the history lookup simply comes back empty instead of failing loudly.
 * @param {Network} network The network to resolve.
 * @returns {string} The API base URL, or an empty string when none can be derived.
 */
export const getExplorerApi = (network: Network) =>
{
    const guessed = network.explorerUrl.length === 0 ? '' : `${ network.explorerUrl.replace(/\/+$/, '') }/api`;

    const base = network.explorerApi !== undefined && network.explorerApi.length > 0 ? network.explorerApi : guessed;

    if (base.length === 0 || network.explorerKey === undefined || network.explorerKey.length === 0)
    {
        return base;
    }

    // Folded into the base rather than added by each caller: every one of them already appends its own
    // query with the same `?`-or-`&` test, so a key carried here rides along with all of them.
    return `${ base }${ base.includes('?') ? '&' : '?' }apikey=${ encodeURIComponent(network.explorerKey) }`;
};

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

    if (providerCache?.id === network.id)
    {
        return providerCache.provider;
    }

    const endpoints = [ network.rpcUrl, ...network.rpcBackups ?? [] ].map((url) => url.trim()).filter((url) => url.length > 0);

    const single = (url: string) => new JsonRpcProvider(url, network.chainId, { staticNetwork: true });

    const provider: AbstractProvider = endpoints.length > 1 ?
        new FallbackProvider(endpoints.map((url, index) => ({ provider: single(url), priority: index + 1, weight: 1, stallTimeout: 1500 })), network.chainId, { quorum: 1 }) :
        single(endpoints[0] ?? network.rpcUrl);

    providerCache = { id: network.id, provider };

    return provider;
};

/**
 * Persist the current list of custom networks.
 * @returns {Promise<void>} Resolves once the list is written.
 */
const persistCustom = async() =>
{
    await setValue('App.Networks', JSON.stringify(customNetworks));
};

/**
 * Activate a network by id and persist the selection.
 *
 * Unknown ids are ignored so a stale stored value can never leave the app without a provider.
 * @param {string} id Network id to activate.
 * @returns {Promise<void>} Resolves after the preference is saved.
 */
export const setNetwork = async(id: string) =>
{
    if (!getNetworks().some((item) => item.id === id))
    {
        return;
    }

    networkCurrentId = id;

    await setValue('App.Network', id);
};

/**
 * Add a custom network, activate it, and persist both the list and the selection.
 *
 * The id is derived from the chain id so re-adding the same chain updates the existing entry instead of duplicating it.
 * @param {Omit<Network, 'id' | 'custom'>} input The network fields supplied by the user.
 * @returns {Promise<Network>} The stored network.
 */
export const addNetwork = async(input: Omit<Network, 'id' | 'custom'>) =>
{
    const network: Network = { ...input, id: `custom-${ input.chainId }`, custom: true };

    customNetworks = [ ...customNetworks.filter((item) => item.id !== network.id), network ];

    providerCache = undefined;

    await persistCustom();

    await setNetwork(network.id);

    return network;
};

/**
 * Remove a custom network. Built-in networks are never removable.
 *
 * If the active network is the one removed, selection falls back to the first built-in network.
 * @param {string} id Network id to remove.
 * @returns {Promise<void>} Resolves after the change is persisted.
 */
export const removeNetwork = async(id: string) =>
{
    const target = customNetworks.find((item) => item.id === id);

    if (target === undefined)
    {
        return;
    }

    customNetworks = customNetworks.filter((item) => item.id !== id);

    providerCache = undefined;

    await persistCustom();

    if (networkCurrentId === id)
    {
        await setNetwork(defaultNetworks[0].id);
    }
};

/**
 * Load persisted custom networks and the active-network selection.
 *
 * Malformed stored data is ignored so a corrupt entry can never crash startup.
 * @returns {Promise<void>} Resolves after the active network is initialized.
 */
export const initNetwork = async() =>
{
    // Read defensively, like the theme and the language beside it: this is awaited before the first
    // render, and a storage read that throws here would leave the app with no window rather than with
    // the built-in networks it can perfectly well fall back to.
    const storedNetworks = await getValue('App.Networks').catch(() => undefined);

    if (storedNetworks !== undefined)
    {
        try
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const parsed = JSON.parse(storedNetworks) as Network[];

            if (Array.isArray(parsed))
            {
                customNetworks = parsed
                    .filter((item) => typeof item.id === 'string' && typeof item.chainId === 'number' && typeof item.rpcUrl === 'string')
                    // A network stored before backups existed has none, and a corrupted list should
                    // cost the extra endpoints rather than the whole network.
                    .map((item) => ({ ...item, rpcBackups: Array.isArray(item.rpcBackups) ? item.rpcBackups.filter((url): url is string => typeof url === 'string' && url.length > 0) : [] }));
            }
        }
        catch
        {
            customNetworks = [];
        }
    }

    const storedCurrent = await getValue('App.Network').catch(() => undefined);

    if (storedCurrent !== undefined && getNetworks().some((item) => item.id === storedCurrent))
    {
        networkCurrentId = storedCurrent;
    }
};
