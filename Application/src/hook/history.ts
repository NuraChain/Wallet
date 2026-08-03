import { formatUnits } from 'ethers';
import { useCallback, useEffect, useState } from 'react';

import { getExplorerApi, type Network } from '../core/network';
import type { Token } from '../core/token';

/**
 * A single account transaction as shown in the activity list.
 */
export interface Transaction
{
    id: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    symbol: string;
    timestamp: number;
    incoming: boolean;
}

/**
 * One row of an Etherscan-compatible `txlist` / `tokentx` response. Every field arrives as a string, and the token-only fields are absent on native transfers.
 */
interface ExplorerRow
{
    hash?: unknown;
    from?: unknown;
    to?: unknown;
    value?: unknown;
    timeStamp?: unknown;
    tokenSymbol?: unknown;
    tokenDecimal?: unknown;
}

/**
 * How many transactions of each kind (native and token) to request.
 *
 * The wallet tab only ever shows a handful, but the overview page is searchable, so it is worth pulling a deeper page than the glance needs.
 */
const pageSize = 50;

/**
 * What one explorer call came back with: the transactions, and why there were none if the explorer said
 * so itself.
 *
 * The two are not the same answer and used to be flattened into one. An explorer that refuses the
 * request — no key, a chain its plan does not cover, a host that has moved — produced an empty list,
 * which the UI then showed as "no transactions": the account looked untouched instead of unreadable.
 */
interface ExplorerAnswer { items: Transaction[]; notice: string }

/**
 * Read one Etherscan-compatible action and map it into transactions.
 *
 * Blockscout answers `status: '0'` with a "no transactions found" message for an account that has never transacted, which is a normal empty result rather than an error — it still carries `result` as an array, which is how it is told apart from a refusal, where `result` is the explanation itself.
 * @param {string} action The action to call, `txlist` or `tokentx`.
 * @param {string} address The account address.
 * @param {Network} network Active network, which supplies the API base, the native symbol and its decimals.
 * @returns {Promise<ExplorerAnswer>} The mapped transactions, or the reason there are none.
 */
const readAction = async(action: string, address: string, network: Network): Promise<ExplorerAnswer> =>
{
    const api = getExplorerApi(network);
    const query = `module=account&action=${ action }&address=${ encodeURIComponent(address) }&page=1&offset=${ pageSize }&sort=desc`;

    const response = await fetch(`${ api }${ api.includes('?') ? '&' : '?' }${ query }`);

    if (!response.ok)
    {
        return { items: [], notice: `explorer answered HTTP ${ response.status }` };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const parsed = await response.json() as { result?: unknown; message?: unknown };

    if (!Array.isArray(parsed.result))
    {
        // A refusal states its reason where the rows would be, and that sentence is worth more to the
        // user than a blank list — it is the difference between "nothing happened here" and "this
        // network's explorer will not answer without a key".
        const reason = typeof parsed.result === 'string' && parsed.result.length > 0 ? parsed.result : '';

        const fallback = typeof parsed.message === 'string' && parsed.message.length > 0 ? parsed.message : 'explorer returned no transaction list';

        return { items: [], notice: reason.length > 0 ? reason : fallback };
    }

    const owner = address.toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const rows = parsed.result as ExplorerRow[];

    const items = rows.flatMap((row, index): Transaction[] =>
    {
        if (typeof row.hash !== 'string' || typeof row.from !== 'string' || typeof row.value !== 'string')
        {
            return [];
        }

        const isToken = typeof row.tokenSymbol === 'string' && row.tokenSymbol.length > 0;

        // A native row worth nothing is a contract call, not a transfer — and it is usually the very
        // transaction that carried a token transfer already listed by `tokentx`.
        if (!isToken && row.value === '0')
        {
            return [];
        }

        const to = typeof row.to === 'string' ? row.to : '';
        const decimals = typeof row.tokenDecimal === 'string' ? Number(row.tokenDecimal) : network.decimals;
        const symbol = isToken ? String(row.tokenSymbol) : network.symbol;

        return [ {
            id: `${ action }-${ index }-${ row.hash }`,
            hash: row.hash,
            from: row.from,
            to,
            value: formatUnits(row.value, Number.isInteger(decimals) ? decimals : 18),
            symbol,
            timestamp: typeof row.timeStamp === 'string' ? Number(row.timeStamp) : 0,
            incoming: to.toLowerCase() === owner
        } ];
    });

    return { items, notice: '' };
};

/**
 * GoldRush (Covalent) reads the chains an Etherscan-family explorer will not.
 *
 * BNB Smart Chain is the reason this exists. Its data is only sold through a paid Etherscan plan, no
 * Blockscout instance covers it, and the free RPCs cap `eth_getLogs` at between 25 and 5000 blocks —
 * minutes of history, and native transfers cannot be read from logs at all. GoldRush answers chain 56
 * on a free key, so it is asked whenever the explorer comes back with nothing.
 *
 * A fallback and not the first choice: Blockscout serves Nura and Ethereum without a key or a credit,
 * and spending either where the explorer already works would be waste.
 */
const covalentKey = 'cqt_rQ8QCcv7tjg9rbjjCbh9GbjM8pgH';

/**
 * Root of the API. The chain is addressed by number rather than by GoldRush's own slug, which saves
 * every caller from having to know that chain 56 is spelled `bsc-mainnet` over there.
 */
const covalentBase = 'https://api.covalenthq.com/v1';

/**
 * How many tracked tokens are asked about.
 *
 * Token movements come one contract per request there, at about a second each, so an account tracking
 * a long list would otherwise spend a slow minute assembling one screen.
 */
const covalentTokens = 4;

/**
 * One row of a GoldRush response. Snake case because that is what the API sends.
 */
interface CovalentRow
{
    tx_hash?: unknown;
    from_address?: unknown;
    to_address?: unknown;
    value?: unknown;
    block_signed_at?: unknown;
    transfers?: unknown;
}

/**
 * One entry of a GoldRush `transfers` array: the movement itself, already decoded.
 */
interface CovalentTransfer
{
    tx_hash?: unknown;
    from_address?: unknown;
    to_address?: unknown;
    delta?: unknown;
    block_signed_at?: unknown;
    contract_decimals?: unknown;
    contract_ticker_symbol?: unknown;
}

/**
 * covalentGet - Ask GoldRush for one list, and treat every failure as an empty one.
 * @param {string} path The path under the version root, starting with a slash.
 * @returns {Promise<unknown[]>} The `items` array, or an empty list.
 */
const covalentGet = async(path: string): Promise<unknown[]> =>
{
    try
    {
        const response = await fetch(`${ covalentBase }${ path }`, { headers: { Authorization: `Bearer ${ covalentKey }` } });

        if (!response.ok)
        {
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = await response.json() as { data?: { items?: unknown } };

        const items: unknown = parsed.data?.items;

        // `Array.isArray` on an `unknown` narrows to `any[]`, which is exactly what must not escape
        // this function — every caller reads the rows field by field and checks each type as it goes.
        return Array.isArray(items) ? items as unknown[] : [];
    }
    catch
    {
        return [];
    }
};

/**
 * covalentSeconds - GoldRush stamps rows with an ISO string; the rest of the app counts seconds.
 * @param {unknown} value The `block_signed_at` field.
 * @returns {number} Unix seconds, or zero when it cannot be read.
 */
const covalentSeconds = (value: unknown) =>
{
    if (typeof value !== 'string')
    {
        return 0;
    }

    const parsed = Date.parse(value);

    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
};

/**
 * readCovalentNative - The account's own coin transfers.
 *
 * `no-logs=true` matters more than it looks. With the logs left in, one page of this came back at
 * fourteen megabytes: GoldRush lists every transaction the address appears anywhere inside — spam
 * airdrops included — and attaches every decoded event to each one. Without them the same page is
 * sixty kilobytes, and the rows that are not this account's own coin transfers are dropped here.
 * @param {string} address Account address.
 * @param {Network} network Active network, which supplies the chain id, symbol and decimals.
 * @returns {Promise<Transaction[]>} The coin transfers.
 */
const readCovalentNative = async(address: string, network: Network): Promise<Transaction[]> =>
{
    const items = await covalentGet(`/${ network.chainId }/address/${ encodeURIComponent(address) }/transactions_v3/?no-logs=true`);

    const owner = address.toLowerCase();

    return items.flatMap((raw, index): Transaction[] =>
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const row = raw as CovalentRow;

        if (typeof row.tx_hash !== 'string' || typeof row.from_address !== 'string' || typeof row.value !== 'string')
        {
            return [];
        }

        const to = typeof row.to_address === 'string' ? row.to_address : '';

        // A row worth nothing moved no coin, and a row this account is neither side of is one it only
        // appears in through a log — the token pass below is what reads those.
        if (row.value === '0' || (row.from_address.toLowerCase() !== owner && to.toLowerCase() !== owner))
        {
            return [];
        }

        return [ {
            id: `covalent-native-${ index }-${ row.tx_hash }`,
            hash: row.tx_hash,
            from: row.from_address,
            to,
            value: formatUnits(row.value, network.decimals),
            symbol: network.symbol,
            timestamp: covalentSeconds(row.block_signed_at),
            incoming: to.toLowerCase() === owner
        } ];
    });
};

/**
 * readCovalentToken - One tracked contract's movements in and out of the account.
 * @param {string} address Account address.
 * @param {Network} network Active network, which supplies the chain id.
 * @param {Token} token The contract to ask about.
 * @returns {Promise<Transaction[]>} That token's transfers.
 */
const readCovalentToken = async(address: string, network: Network, token: Token): Promise<Transaction[]> =>
{
    const items = await covalentGet(`/${ network.chainId }/address/${ encodeURIComponent(address) }/transfers_v2/?contract-address=${ encodeURIComponent(token.address) }`);

    const owner = address.toLowerCase();

    return items.flatMap((raw, index): Transaction[] =>
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const row = raw as CovalentRow;

        if (!Array.isArray(row.transfers))
        {
            return [];
        }

        return row.transfers.flatMap((entry, inner): Transaction[] =>
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const move = entry as CovalentTransfer;

            const rowHash = typeof row.tx_hash === 'string' ? row.tx_hash : '';
            const hash = typeof move.tx_hash === 'string' ? move.tx_hash : rowHash;

            if (hash.length === 0 || typeof move.delta !== 'string')
            {
                return [];
            }

            const from = typeof move.from_address === 'string' ? move.from_address : '';
            const to = typeof move.to_address === 'string' ? move.to_address : '';

            const decimals = typeof move.contract_decimals === 'number' ? move.contract_decimals : token.decimals;
            const ticker = typeof move.contract_ticker_symbol === 'string' && move.contract_ticker_symbol.length > 0 ? move.contract_ticker_symbol : token.symbol;

            return [ {
                id: `covalent-${ token.address }-${ index }-${ inner }-${ hash }`,
                hash,
                from,
                to,
                value: formatUnits(move.delta, decimals),
                symbol: ticker,
                timestamp: covalentSeconds(move.block_signed_at ?? row.block_signed_at),
                incoming: to.toLowerCase() === owner
            } ];
        });
    });
};

/**
 * readCovalent - Coin and token movements together.
 * @param {string} address Account address.
 * @param {Network} network Active network.
 * @param {Token[]} tokens Tracked tokens, of which the first few are asked about.
 * @returns {Promise<Transaction[]>} Everything found, in no particular order.
 */
const readCovalent = async(address: string, network: Network, tokens: Token[]): Promise<Transaction[]> =>
{
    const reads = [ readCovalentNative(address, network), ...tokens.slice(0, covalentTokens).map(async(token) => readCovalentToken(address, network, token)) ];

    const results = await Promise.all(reads.map(async(read) => read.catch((): Transaction[] => [])));

    return results.flat();
};

/**
 * Read the transaction history for an account on a network.
 *
 * Plain JSON-RPC cannot enumerate past transactions, so history comes from the network's Etherscan-compatible explorer API (Blockscout for the built-in chains, which needs no key). Native transfers and ERC20 transfers are fetched separately and merged newest-first.
 *
 * When the explorer has nothing to give — no API, or one that refuses the chain — GoldRush is asked
 * instead. BNB Smart Chain is why: its explorer data is sold only with a paid Etherscan plan, and that
 * is a limit of the source rather than of the account. The `notice` is what survives both failing, and
 * it is the difference between "this could not be read" and "nothing ever happened here".
 *
 * Tokens come in because GoldRush answers one contract per request, so it has to be told which ones
 * are worth asking about; the explorer path names them all by itself and ignores the argument.
 * @param {string} address Account address to query.
 * @param {Network} network Active network.
 * @param {Token[]} tokens Tracked tokens, used only by the GoldRush fallback.
 * @returns {{ items: Transaction[]; loading: boolean; notice: string }} History state.
 */
export const useHistory = (address: string, network: Network, tokens: Token[]) =>
{
    const [ items, setItems ] = useState<Transaction[]>([]);
    const [ notice, setNotice ] = useState('');
    const [ loading, setLoading ] = useState(true);
    const [ nonce, setNonce ] = useState(0);

    const refresh = useCallback(() =>
    {
        setNonce((current) => current + 1);
    }, []);

    const api = getExplorerApi(network);

    const tokenKey = tokens.map((item) => item.address).join(',');

    useEffect(() =>
    {
        let active = true;

        const run = async() =>
        {
            setLoading(true);

            const answers = api.length === 0 ?
                [ { items: [], notice: 'this network has no explorer API configured' } ] :
                await Promise.all([ 'txlist', 'tokentx' ].map(async(action) => readAction(action, address, network).catch((cause: unknown): ExplorerAnswer => ({ items: [], notice: cause instanceof Error ? cause.message : String(cause) }))));

            if (!active)
            {
                return;
            }

            const found = answers.flatMap((item) => item.items);

            // Asked only where the explorer came up empty, so the chains it already serves cost no
            // credits. An account that genuinely has no transactions pays one wasted request for that.
            const merged = found.length > 0 ? found : await readCovalent(address, network, tokens).catch((): Transaction[] => []);

            if (!active)
            {
                return;
            }

            const sorted = merged.sort((left, right) => right.timestamp - left.timestamp);

            // Only worth saying when there is nothing to show. One call failing while another returned
            // rows is not something the user needs told about.
            setNotice(sorted.length > 0 ? '' : answers.map((item) => item.notice).find((text) => text.length > 0) ?? '');

            setItems(sorted.slice(0, pageSize));
            setLoading(false);
        };

        void run();

        return () =>
        {
            active = false;
        };
    }, [ address, network.id, api, tokenKey, nonce ]);

    return { items, loading, notice, refresh };
};
