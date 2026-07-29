import { Contract, formatUnits, getAddress, isAddress } from 'ethers';

import { getProvider } from './network';
import { getValue, setValue } from '../utility/storage';

/**
 * An ERC20 token tracked for a given chain.
 *
 * `coinId` is the CoinGecko id used for pricing. Most user-added contracts have none, in which case the token still shows its balance but contributes nothing to the portfolio total.
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
 * Tokens the user added, keyed by chain id. The list is per chain because the same symbol is a different contract on another chain.
 */
export type TokenMap = Record<number, Token[]>;

/**
 * Minimal ERC20 read surface used for balance lookups and contract discovery.
 */
export const erc20Abi =
[
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)'
];

/**
 * CoinGecko ids for well-known contracts, keyed by chain id then lowercased address.
 *
 * These are not tokens the wallet shows by default — nothing is shown until the user adds it. The map only exists so that adding a familiar stablecoin still yields a USD value instead of a blank price.
 */
const coinIds: Record<number, Record<string, string | undefined> | undefined> =
{
    1:
    {
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'usd-coin',
        '0xdac17f958d2ee523a2206206994597c13d831ec7': 'tether',
        '0x6b175474e89094c44da98b954eedeac495271d0f': 'dai',
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'weth'
    },
    56:
    {
        '0x55d398326f99059ff775485246999027b3197955': 'tether',
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 'usd-coin',
        '0xe9e7cea3dedca5984780bafc599bd69add087d56': 'binance-usd',
        '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': 'wbnb'
    }
};

/**
 * getCoinId - CoinGecko id for a contract, or an empty string when it is not a known asset.
 * @param {number} chainId Chain the contract lives on.
 * @param {string} address Contract address.
 * @returns {string} The coin id, or an empty string.
 */
const getCoinId = (chainId: number, address: string) => coinIds[chainId]?.[address.toLowerCase()] ?? '';

/**
 * loadTokens - Reads the per-chain list of user-added tokens.
 *
 * A malformed entry is dropped rather than thrown on, so corrupted storage degrades to "no tokens added" instead of crashing the dashboard.
 * @returns {Promise<TokenMap>} Added tokens per chain id.
 */
export const loadTokens = async(): Promise<TokenMap> =>
{
    const stored = await getValue('Wallet.Tokens');

    if (stored === undefined || stored.length === 0)
    {
        return {};
    }

    const tokens: TokenMap = {};

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
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                const entries = list.filter((item): item is Token => typeof item === 'object' && item !== null && typeof (item as Token).address === 'string' && typeof (item as Token).decimals === 'number');

                if (entries.length > 0)
                {
                    tokens[chainId] = entries;
                }
            }
        }
    }
    catch
    {
        return {};
    }

    return tokens;
};

/**
 * saveTokens - Persists the per-chain list of user-added tokens.
 * @param {TokenMap} tokens Added tokens per chain id.
 * @returns {Promise<void>} Resolves once written.
 */
export const saveTokens = async(tokens: TokenMap) =>
{
    await setValue('Wallet.Tokens', JSON.stringify(tokens));
};

/**
 * Read a contract's ERC20 metadata straight off the active network.
 *
 * The user only supplies an address, so symbol, name and decimals come from the chain itself. `name` is optional in practice — a contract that does not expose it falls back to its symbol rather than failing the whole add.
 * @param {number} chainId Chain the contract lives on, used to look up a price id.
 * @param {string} address Contract address supplied by the user.
 * @returns {Promise<Token>} The resolved token.
 * @throws {Error} When the address is malformed or the contract is not a readable ERC20.
 */
export const readToken = async(chainId: number, address: string): Promise<Token> =>
{
    if (!isAddress(address))
    {
        throw new Error('invalid contract address');
    }

    const contract = new Contract(getAddress(address), erc20Abi, getProvider());

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const symbol = await contract.symbol() as string;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const decimals = Number(await contract.decimals() as bigint | number);

    const name = await contract.name().then((value: unknown) => (typeof value === 'string' && value.length > 0 ? value : symbol)).catch(() => symbol);

    if (typeof symbol !== 'string' || symbol.length === 0 || !Number.isInteger(decimals))
    {
        throw new Error('contract is not an ERC20 token');
    }

    return { address: getAddress(address), symbol, name, decimals, coinId: getCoinId(chainId, address) };
};

/**
 * Read the account balances for a list of tokens on the active network.
 *
 * Each token is queried independently; a failing contract call resolves to a zero balance rather than rejecting the whole batch, so one bad RPC response cannot blank the list.
 * @param {string} address Account address to query.
 * @param {Token[]} tokens Tokens to read.
 * @returns {Promise<TokenBalance[]>} Balances in the same order as `tokens`.
 */
export const readTokenBalances = async(address: string, tokens: Token[]): Promise<TokenBalance[]> =>
{
    const provider = getProvider();

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
