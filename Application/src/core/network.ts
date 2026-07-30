import { JsonRpcProvider } from 'ethers';

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
    explorerUrl: string;
    explorerApi?: string;
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
        rpcUrl: 'https://rpc.ashbringer.org/',
        explorerUrl: 'https://nura-chain.cloud.blockscout.com',
        explorerApi: 'https://nura-chain.cloud.blockscout.com/api',
        decimals: 18,
        custom: false
    },
    {
        id: 'ethereum',
        name: 'Ethereum',
        chainId: 1,
        symbol: 'ETH',
        rpcUrl: 'https://eth.llamarpc.com',
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
        explorerUrl: 'https://bscscan.com',
        decimals: 18,
        custom: false
    }
];

let customNetworks: Network[] = [];
let networkCurrentId: string = defaultNetworks[0].id;
let providerCache: { id: string; provider: JsonRpcProvider } | undefined;

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
    if (network.explorerApi !== undefined && network.explorerApi.length > 0)
    {
        return network.explorerApi;
    }

    return network.explorerUrl.length === 0 ? '' : `${ network.explorerUrl.replace(/\/+$/, '') }/api`;
};

/**
 * Build (and memoize) a static `JsonRpcProvider` for the active network.
 *
 * The provider is cached per network id, so switching networks and switching back does not leak a new provider each time. `staticNetwork` skips the `eth_chainId` round-trip on every call.
 * @returns {JsonRpcProvider} Provider bound to the active network.
 */
export const getProvider = () =>
{
    const network = getNetwork();

    if (providerCache?.id === network.id)
    {
        return providerCache.provider;
    }

    const provider = new JsonRpcProvider(network.rpcUrl, network.chainId, { staticNetwork: true });

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
    const storedNetworks = await getValue('App.Networks');

    if (storedNetworks !== undefined)
    {
        try
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const parsed = JSON.parse(storedNetworks) as Network[];

            if (Array.isArray(parsed))
            {
                customNetworks = parsed.filter((item) => typeof item.id === 'string' && typeof item.chainId === 'number' && typeof item.rpcUrl === 'string');
            }
        }
        catch
        {
            customNetworks = [];
        }
    }

    const storedCurrent = await getValue('App.Network');

    if (storedCurrent !== undefined && getNetworks().some((item) => item.id === storedCurrent))
    {
        networkCurrentId = storedCurrent;
    }
};
