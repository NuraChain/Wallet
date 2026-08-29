import { Contract, formatUnits, getAddress, isAddress } from 'ethers';

import { httpRequest } from './request';
import { getProvider } from './network.provider';
import { getExplorerApi, type Network } from './network';
import { getValue, setValue } from '../utility/storage';

/**
 * An ERC20 token tracked for a given chain.
 *
 * `coinId` is the CoinGecko id used for pricing. Most user-added contracts have none, in which case the token still shows its balance but contributes nothing to the portfolio total.
 */
export interface Token {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    coinId: string;
}

/**
 * A token paired with the connected account's balance.
 */
export interface TokenBalance {
    token: Token;
    value: bigint;
    formatted: string;
}

/**
 * Tokens the user added, keyed by chain id. The list is per chain because the same symbol is a different contract on another chain.
 */
export type TokenMap = Record<number, Token[]>;

/**
 * Contracts the user removed from the list, keyed by chain id and held in lowercase.
 *
 * Removing a token only ever took it out of `TokenMap`, and discovery skips what is *tracked* — so the
 * next sweep found the same contract again, still held, and added it straight back. The user's decision
 * has to outlive the list it was made about, which is what this is: not a cache, and not derivable from
 * anything else on disk, so it sits in the wallet store beside the tracked list rather than in a read cache.
 *
 * It is a record of an intent, not of a state, so it holds addresses rather than tokens — the metadata
 * would be re-read from the chain if the user ever asked for the token back.
 *
 * Keyed by chain only, matching `TokenMap`: the tracked list is already shared across accounts, and a
 * token dismissed on one account is dismissed on the chain.
 */
export type HiddenMap = Record<number, string[]>;

/**
 * Minimal ERC20 read surface used for balance lookups and contract discovery.
 */
export const erc20Abi = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)'
];

/**
 * The handful of contracts worth checking blind on each chain.
 *
 * Nothing here is shown by default — a wallet holding none of them still lists nothing. They exist
 * because discovery otherwise depends entirely on an explorer, and a chain whose explorer refuses to
 * answer would show no tokens at all however many the account holds. BNB Smart Chain is exactly that
 * case: its API is behind a paid plan, so without this list a balance in USDT there is invisible.
 *
 * `coinId` is the CoinGecko id used for pricing, which is also why this list was here before it named
 * anything else. Metadata is stated rather than read from each contract, so a chain with no explorer
 * costs one `balanceOf` per entry instead of four calls.
 */
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

/**
 * getCoinId - CoinGecko id for a contract, or an empty string when it is not a known asset.
 * @param {number} chainId Chain the contract lives on.
 * @param {string} address Contract address.
 * @returns {string} The coin id, or an empty string.
 */
const getCoinId = (chainId: number, address: string) =>
    knownTokens[chainId]?.find((item) => item.address.toLowerCase() === address.toLowerCase())?.coinId ?? '';

/**
 * loadTokens - Reads the per-chain list of user-added tokens.
 *
 * A malformed entry is dropped rather than thrown on, so corrupted storage degrades to "no tokens added" instead of crashing the dashboard.
 * @returns {Promise<TokenMap>} Added tokens per chain id.
 */
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

/**
 * saveTokens - Persists the per-chain list of user-added tokens.
 * @param {TokenMap} tokens Added tokens per chain id.
 * @returns {Promise<void>} Resolves once written.
 */
export const saveTokens = async (tokens: TokenMap) => {
    await setValue('Wallet.Tokens', JSON.stringify(tokens));
};

/**
 * loadHiddenTokens - Reads the per-chain list of contracts the user removed.
 *
 * Held lowercase so every comparison downstream is a plain `Set.has`. Anything that is not an address
 * is dropped rather than thrown on: a corrupted entry should cost one suppression, not the dashboard.
 * @returns {Promise<HiddenMap>} Removed contract addresses per chain id.
 */
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

/**
 * saveHiddenTokens - Persists the per-chain list of contracts the user removed.
 * @param {HiddenMap} hidden Removed contract addresses per chain id.
 * @returns {Promise<void>} Resolves once written.
 */
export const saveHiddenTokens = async (hidden: HiddenMap) => {
    await setValue('Wallet.TokensHidden', JSON.stringify(hidden));
};

/**
 * hideToken - Records that the user removed a contract, so discovery stops offering it.
 *
 * Pure, and the only place the lowercase-and-deduplicate rule lives, so no call site has to remember
 * which case the stored form is in.
 * @param {HiddenMap} hidden The current map.
 * @param {number} chainId The chain the contract is on.
 * @param {string} address The contract address, in any case.
 * @returns {HiddenMap} A new map including that address.
 */
export const hideToken = (hidden: HiddenMap, chainId: number, address: string): HiddenMap => {
    const entry = address.toLowerCase();
    const list = hidden[chainId] ?? [];

    return list.includes(entry) ? hidden : { ...hidden, [chainId]: [...list, entry] };
};

/**
 * unhideToken - Forgets that a contract was ever removed.
 *
 * Adding a token by hand is the user asking for it back in as many words, and it has to clear the
 * suppression or the very next sweep would be entitled to drop it again.
 * @param {HiddenMap} hidden The current map.
 * @param {number} chainId The chain the contract is on.
 * @param {string} address The contract address, in any case.
 * @returns {HiddenMap} A new map without that address.
 */
export const unhideToken = (hidden: HiddenMap, chainId: number, address: string): HiddenMap => {
    const entry = address.toLowerCase();
    const list = hidden[chainId] ?? [];

    return list.includes(entry) ? { ...hidden, [chainId]: list.filter((item) => item !== entry) } : hidden;
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

/**
 * One row of an explorer's token response.
 *
 * `tokenlist` names the fields one way and `tokentx` another, so both spellings are accepted and the
 * reader takes whichever is present.
 */
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

/**
 * readText - The first of two spellings of a field that is actually a string.
 *
 * `tokenlist` and `tokentx` name the same three fields differently, so every read has a pair to try.
 * @param {unknown} first The `tokenlist` spelling.
 * @param {unknown} second The `tokentx` spelling.
 * @returns {string} The first usable string, or an empty one.
 */
const readText = (first: unknown, second: unknown) => {
    if (typeof first === 'string' && first.length > 0) {
        return first;
    }

    return typeof second === 'string' ? second : '';
};

/**
 * How many discovered contracts are checked on chain in one pass.
 *
 * Each one is a `balanceOf` call, so an account that has touched hundreds of tokens would otherwise
 * open hundreds of RPC requests the moment the dashboard loads.
 */
const discoverLimit = 40;

/**
 * readExplorerTokens - Ask one explorer action for the contracts an account has held.
 *
 * `tokenlist` is the direct question and Blockscout answers it with balances attached. Etherscan-style
 * explorers have no such action, so the fallback is `tokentx` — every ERC20 transfer the account was
 * party to, which names each contract it has ever touched. Neither answer is trusted for the balance
 * itself; that is read from the chain afterwards.
 * @param {string} api The explorer API base.
 * @param {string} action The action to call, `tokenlist` or `tokentx`.
 * @param {string} address The account address.
 * @returns {Promise<ExplorerToken[]>} The rows, or an empty list when the call fails or is unsupported.
 */
const readExplorerTokens = async (api: string, action: string, address: string): Promise<ExplorerToken[]> => {
    const query = `module=account&action=${action}&address=${encodeURIComponent(address)}&page=1&offset=100&sort=desc`;

    try {
        // Same client as the history reader, for the same reason: this is an explorer, and one of them
        // cannot be reached from the webview at all — see [request.ts](request.ts).
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

/**
 * Read the account balances for a list of tokens on the active network.
 *
 * Each token is queried independently; a failing contract call resolves to a zero balance rather than rejecting the whole batch, so one bad RPC response cannot blank the list.
 *
 * **Unless they all fail.** One contract that will not answer is a bad contract, and zero is a fair
 * thing to show for it; every contract failing at once is the chain being unreachable, and showing a
 * screen of zeroes for that is telling the user their tokens are gone. That case rejects instead, so
 * the caller can fall back to the last balances it actually saw.
 * @param {string} address Account address to query.
 * @param {Token[]} tokens Tokens to read.
 * @returns {Promise<TokenBalance[]>} Balances in the same order as `tokens`.
 * @throws {Error} When every contract read failed, which is the network rather than the contracts.
 */
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

/**
 * discoverTokens - Tokens the account actually holds on a network but is not tracking yet.
 *
 * Nothing used to appear in the list until the user pasted a contract address, which meant a wallet
 * that plainly held a token showed nothing of it. The explorer is asked which contracts this account
 * has held, and every candidate it names is then verified against the chain — a balance is only
 * believed if `balanceOf` returns one, so a token transferred away does not come back as an empty row.
 *
 * A network with no working explorer discovers nothing and says so by returning an empty list, which
 * is the same outcome as an account that holds nothing. Manual adding is unaffected either way.
 *
 * `hidden` is what keeps a removal from being undone. Skipping only what is *tracked* meant a token the
 * user deleted was, by the next sweep, simply a held contract nobody was tracking — which is precisely
 * what this function exists to add — so it came straight back. A held balance is not a reason to
 * re-add something the user has already said no to; only their adding it by hand is.
 * @param {string} address Account address to inspect.
 * @param {Network} network Active network, which supplies the explorer and the chain id.
 * @param {Token[]} known Tokens already tracked on this chain, which are skipped.
 * @param {string[]} hidden Lowercase contract addresses the user removed on this chain, also skipped.
 * @returns {Promise<Token[]>} Held tokens worth adding, in the order the explorer named them.
 */
export const discoverTokens = async (address: string, network: Network, known: Token[], hidden: string[] = []): Promise<Token[]> => {
    const api = getExplorerApi(network);

    const rows = api.length === 0 ? [] : await readExplorerTokens(api, 'tokenlist', address);

    const listed = rows.length > 0 || api.length === 0 ? rows : await readExplorerTokens(api, 'tokentx', address);

    // Tracked and dismissed contracts are both "do not offer this", so they share one set — which also
    // covers the blind `knownTokens` path below, not just the explorer rows.
    const skip = new Set([...known.map((item) => item.address.toLowerCase()), ...hidden.map((item) => item.toLowerCase())]);

    // An explorer that named nothing is either absent, refusing, or looking at an account it has never
    // seen, and none of those mean the account holds nothing. The blind list covers that gap; where the
    // explorer did answer it already names everything this would, so it is not asked for twice.
    const candidates: Token[] = listed.length > 0 ? [] : (knownTokens[network.chainId] ?? []).filter((item) => !skip.has(item.address.toLowerCase()));

    for (const item of candidates) {
        skip.add(item.address.toLowerCase());
    }

    for (const row of listed) {
        if (typeof row.contractAddress !== 'string' || !isAddress(row.contractAddress)) {
            continue;
        }

        // Blockscout labels NFTs in the same list, and neither a balance nor a decimals count means
        // the same thing for those.
        if (typeof row.type === 'string' && row.type.length > 0 && row.type.toUpperCase() !== 'ERC-20') {
            continue;
        }

        const address20 = getAddress(row.contractAddress);

        if (skip.has(address20.toLowerCase())) {
            continue;
        }

        // `tokenlist` reports the balance it knows about, and an account keeps its entry there long
        // after the last of a token has gone. Skipping those here spends the cap below on contracts
        // that might still hold something, rather than on rows already known to be empty. `tokentx`
        // reports no balance at all, so its rows fall through to the on-chain check.
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
