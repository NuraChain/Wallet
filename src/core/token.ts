import { Contract, formatUnits, getAddress, isAddress } from 'ethers';

import { httpRequest } from './request';
import { getProvider } from './network.provider';
import { getExplorerApi, type Network } from './network';
import { getValue, setValue } from '../utility/storage';

export interface Token {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    coinId: string;
}

export interface TokenBalance {
    token: Token;
    value: bigint;
    formatted: string;
}

export type TokenMap = Record<number, Token[]>;

export type HiddenMap = Record<number, string[]>;

export const erc20Abi = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)'
];

const knownTokens: Record<number, Token[] | undefined> = {
    1: [
        { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6, coinId: 'tether' },
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6, coinId: 'usd-coin' },
        { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, coinId: 'dai' },
        { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, coinId: 'weth' }
    ],
    56: [
        { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether USD', decimals: 18, coinId: 'tether' },
        { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18, coinId: 'usd-coin' },
        { address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', symbol: 'BUSD', name: 'Binance USD', decimals: 18, coinId: 'binance-usd' },
        { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', name: 'Wrapped BNB', decimals: 18, coinId: 'wbnb' }
    ]
};

const getCoinId = (chainId: number, address: string) =>
    knownTokens[chainId]?.find((item) => item.address.toLowerCase() === address.toLowerCase())?.coinId ?? '';

export const loadTokens = async (): Promise<TokenMap> => {
    const stored = await getValue('Wallet.Tokens');

    if (stored === undefined || stored.length === 0) {
        return {};
    }

    const tokens: TokenMap = {};

    try {
        const parsed: unknown = JSON.parse(stored);

        if (typeof parsed !== 'object' || parsed === null) {
            return {};
        }

        for (const [chain, list] of Object.entries<unknown>({ ...parsed })) {
            const chainId = Number(chain);

            if (Number.isInteger(chainId) && Array.isArray(list)) {
                // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                const entries = list.filter(
                    (item): item is Token =>
                        typeof item === 'object' && item !== null && typeof (item as Token).address === 'string' && typeof (item as Token).decimals === 'number'
                );

                if (entries.length > 0) {
                    tokens[chainId] = entries;
                }
            }
        }
    } catch {
        return {};
    }

    return tokens;
};

export const saveTokens = async (tokens: TokenMap) => {
    await setValue('Wallet.Tokens', JSON.stringify(tokens));
};

export const loadHiddenTokens = async (): Promise<HiddenMap> => {
    const stored = await getValue('Wallet.TokensHidden');

    if (stored === undefined || stored.length === 0) {
        return {};
    }

    const hidden: HiddenMap = {};

    try {
        const parsed: unknown = JSON.parse(stored);

        if (typeof parsed !== 'object' || parsed === null) {
            return {};
        }

        for (const [chain, list] of Object.entries<unknown>({ ...parsed })) {
            const chainId = Number(chain);

            if (Number.isInteger(chainId) && Array.isArray(list)) {
                const entries = list.filter((item): item is string => typeof item === 'string' && isAddress(item)).map((item) => item.toLowerCase());

                if (entries.length > 0) {
                    hidden[chainId] = entries;
                }
            }
        }
    } catch {
        return {};
    }

    return hidden;
};

export const saveHiddenTokens = async (hidden: HiddenMap) => {
    await setValue('Wallet.TokensHidden', JSON.stringify(hidden));
};

export const hideToken = (hidden: HiddenMap, chainId: number, address: string): HiddenMap => {
    const entry = address.toLowerCase();
    const list = hidden[chainId] ?? [];

    return list.includes(entry) ? hidden : { ...hidden, [chainId]: [...list, entry] };
};

export const unhideToken = (hidden: HiddenMap, chainId: number, address: string): HiddenMap => {
    const entry = address.toLowerCase();
    const list = hidden[chainId] ?? [];

    return list.includes(entry) ? { ...hidden, [chainId]: list.filter((item) => item !== entry) } : hidden;
};

export const readToken = async (chainId: number, address: string): Promise<Token> => {
    if (!isAddress(address)) {
        throw new Error('invalid contract address');
    }

    const contract = new Contract(getAddress(address), erc20Abi, getProvider());

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const symbol = (await contract.symbol()) as string;

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const decimals = Number((await contract.decimals()) as bigint | number);

    const name = await contract
        .name()
        .then((value: unknown) => (typeof value === 'string' && value.length > 0 ? value : symbol))
        .catch(() => symbol);

    if (typeof symbol !== 'string' || symbol.length === 0 || !Number.isInteger(decimals)) {
        throw new Error('contract is not an ERC20 token');
    }

    return { address: getAddress(address), symbol, name, decimals, coinId: getCoinId(chainId, address) };
};

interface ExplorerToken {
    contractAddress?: unknown;
    balance?: unknown;
    name?: unknown;
    symbol?: unknown;
    decimals?: unknown;
    tokenName?: unknown;
    tokenSymbol?: unknown;
    tokenDecimal?: unknown;
    type?: unknown;
}

const readText = (first: unknown, second: unknown) => {
    if (typeof first === 'string' && first.length > 0) {
        return first;
    }

    return typeof second === 'string' ? second : '';
};

const discoverLimit = 40;

const readExplorerTokens = async (api: string, action: string, address: string): Promise<ExplorerToken[]> => {
    const query = `module=account&action=${action}&address=${encodeURIComponent(address)}&page=1&offset=100&sort=desc`;

    try {
        const response = await httpRequest(`${api}${api.includes('?') ? '&' : '?'}${query}`);

        if (!response.ok) {
            return [];
        }

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = (await response.json()) as { result?: unknown };

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        return Array.isArray(parsed.result) ? (parsed.result as ExplorerToken[]) : [];
    } catch {
        return [];
    }
};

export const readTokenBalances = async (address: string, tokens: Token[]): Promise<TokenBalance[]> => {
    const provider = getProvider();

    let failures = 0;

    const reads = tokens.map(async (token): Promise<TokenBalance> => {
        try {
            const contract = new Contract(token.address, erc20Abi, provider);

            // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const value = (await contract.balanceOf(getAddress(address))) as bigint;

            return { token, value, formatted: formatUnits(value, token.decimals) };
        } catch {
            failures += 1;

            return { token, value: 0n, formatted: '0' };
        }
    });

    const balances = await Promise.all(reads);

    if (tokens.length > 0 && failures === tokens.length) {
        throw new Error('no token balance could be read');
    }

    return balances;
};

export const discoverTokens = async (address: string, network: Network, known: Token[], hidden: string[] = []): Promise<Token[]> => {
    const api = getExplorerApi(network);

    const rows = api.length === 0 ? [] : await readExplorerTokens(api, 'tokenlist', address);

    const listed = rows.length > 0 || api.length === 0 ? rows : await readExplorerTokens(api, 'tokentx', address);

    const skip = new Set([...known.map((item) => item.address.toLowerCase()), ...hidden.map((item) => item.toLowerCase())]);

    const candidates: Token[] = listed.length > 0 ? [] : (knownTokens[network.chainId] ?? []).filter((item) => !skip.has(item.address.toLowerCase()));

    for (const item of candidates) {
        skip.add(item.address.toLowerCase());
    }

    for (const row of listed) {
        if (typeof row.contractAddress !== 'string' || !isAddress(row.contractAddress)) {
            continue;
        }

        if (typeof row.type === 'string' && row.type.length > 0 && row.type.toUpperCase() !== 'ERC-20') {
            continue;
        }

        const address20 = getAddress(row.contractAddress);

        if (skip.has(address20.toLowerCase())) {
            continue;
        }

        if (typeof row.balance === 'string' && /^\d+$/u.test(row.balance) && BigInt(row.balance) === 0n) {
            continue;
        }

        const symbol = readText(row.symbol, row.tokenSymbol);
        const name = readText(row.name, row.tokenName);
        const decimals = Number(row.decimals ?? row.tokenDecimal);

        if (symbol.length === 0 || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
            continue;
        }

        skip.add(address20.toLowerCase());

        candidates.push({ address: address20, symbol, name: name.length > 0 ? name : symbol, decimals, coinId: getCoinId(network.chainId, address20) });

        if (candidates.length >= discoverLimit) {
            break;
        }
    }

    if (candidates.length === 0) {
        return [];
    }

    const balances = await readTokenBalances(address, candidates);

    return balances.filter((item) => item.value > 0n).map((item) => item.token);
};
