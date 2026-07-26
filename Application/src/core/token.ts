import { Contract, formatUnits, getAddress } from 'ethers';

import { getProvider, type Network } from './network';
import { getValue, setValue } from '../utility/storage';

/**
 * An ERC20 token tracked for a given chain.
 */
export interface Token
{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    coinId: string;
}

/**
 * A token paired with the connected account's balance.
 */
export interface TokenBalance
{
    token: Token;
    value: bigint;
    formatted: string;
}

/**
 * Minimal ERC20 read surface used for balance lookups.
 */
export const erc20Abi =
[
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
];

/**
 * Curated ERC20 lists keyed by chain id. Only well-known contracts ship by default.
 */
const tokenRegistry: Record<number, Token[]> =
{
    1:
    [
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6, coinId: 'usd-coin' },
        { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6, coinId: 'tether' },
        { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, coinId: 'dai' },
        { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, coinId: 'weth' }
    ],
    56:
    [
        { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether USD', decimals: 18, coinId: 'tether' },
        { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18, coinId: 'usd-coin' },
        { address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', symbol: 'BUSD', name: 'Binance USD', decimals: 18, coinId: 'binance-usd' },
        { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', name: 'Wrapped BNB', decimals: 18, coinId: 'wbnb' }
    ]
};

/**
 * Return the curated token list for a network's chain, or an empty list when none is known.
 * @param {number} chainId Chain id to look up.
 * @returns {Token[]} Tokens tracked for the chain.
 */
export const getTokens = (chainId: number) => tokenRegistry[chainId] ?? [];

/**
 * Contracts the user chose to hide, keyed by chain id. Hiding is per chain because the same symbol can be a different contract on another chain.
 */
export type HiddenTokens = Record<number, string[]>;

/**
 * loadHiddenTokens - Reads the per-chain hidden contract list.
 *
 * A malformed entry is dropped rather than thrown on, so corrupted storage degrades to "nothing hidden" instead of an empty token list.
 * @returns {Promise<HiddenTokens>} Hidden contracts per chain id.
 */
export const loadHiddenTokens = async(): Promise<HiddenTokens> =>
{
    const stored = await getValue('Wallet.Tokens');

    if (stored === undefined || stored.length === 0)
    {
        return {};
    }

    const hidden: HiddenTokens = {};

    try
    {
        const parsed: unknown = JSON.parse(stored);

        if (typeof parsed !== 'object' || parsed === null)
        {
            return {};
        }

        for (const [ chain, list ] of Object.entries<unknown>({ ...parsed }))
        {
            const chainId = Number(chain);

            if (Number.isInteger(chainId) && Array.isArray(list))
            {
                hidden[chainId] = list.filter((item): item is string => typeof item === 'string');
            }
        }
    }
    catch
    {
        return {};
    }

    return hidden;
};

/**
 * saveHiddenTokens - Persists the per-chain hidden contract list.
 * @param {HiddenTokens} hidden Hidden contracts per chain id.
 * @returns {Promise<void>} Resolves once written.
 */
export const saveHiddenTokens = async(hidden: HiddenTokens) =>
{
    await setValue('Wallet.Tokens', JSON.stringify(hidden));
};

/**
 * Read the account balances for every curated token on the active network.
 *
 * Each token is queried independently; a failing contract call resolves to a zero balance rather than rejecting the whole batch, so one bad RPC response cannot blank the list.
 * @param {string} address Account address to query.
 * @param {Network} network Active network (selects the token list).
 * @returns {Promise<TokenBalance[]>} Balances in the same order as `getTokens`.
 */
export const readTokenBalances = async(address: string, network: Network): Promise<TokenBalance[]> =>
{
    const provider = getProvider();
    const tokens = getTokens(network.chainId);

    const reads = tokens.map(async(token): Promise<TokenBalance> =>
    {
        try
        {
            const contract = new Contract(token.address, erc20Abi, provider);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const value = await contract.balanceOf(getAddress(address)) as bigint;

            return { token, value, formatted: formatUnits(value, token.decimals) };
        }
        catch
        {
            return { token, value: 0n, formatted: '0' };
        }
    });

    return Promise.all(reads);
};
