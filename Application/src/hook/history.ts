import { formatUnits } from 'ethers';
import { useEffect, useState } from 'react';

import { getExplorerApi, type Network } from '../core/network';

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
 * Read one Etherscan-compatible action and map it into transactions.
 *
 * Blockscout answers `status: '0'` with a "no transactions found" message for an account that has never transacted, which is a normal empty result rather than an error — both cases end up as an empty list here.
 * @param {string} action The action to call, `txlist` or `tokentx`.
 * @param {string} address The account address.
 * @param {Network} network Active network, which supplies the API base, the native symbol and its decimals.
 * @returns {Promise<Transaction[]>} The mapped transactions.
 */
const readAction = async(action: string, address: string, network: Network): Promise<Transaction[]> =>
{
    const api = getExplorerApi(network);
    const query = `module=account&action=${ action }&address=${ encodeURIComponent(address) }&page=1&offset=${ pageSize }&sort=desc`;

    const response = await fetch(`${ api }${ api.includes('?') ? '&' : '?' }${ query }`);

    if (!response.ok)
    {
        return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const parsed = await response.json() as { result?: unknown };

    if (!Array.isArray(parsed.result))
    {
        return [];
    }

    const owner = address.toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const rows = parsed.result as ExplorerRow[];

    return rows.flatMap((row, index): Transaction[] =>
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
};

/**
 * Read the transaction history for an account on a network.
 *
 * Plain JSON-RPC cannot enumerate past transactions, so history comes from the network's Etherscan-compatible explorer API (Blockscout for the built-in chains, which needs no key). Native transfers and ERC20 transfers are fetched separately and merged newest-first.
 *
 * A network without a usable explorer, or one whose API rejects the call, resolves to an empty list — the UI shows its empty state instead of an error.
 * @param {string} address Account address to query.
 * @param {Network} network Active network.
 * @returns {{ items: Transaction[]; loading: boolean }} History state.
 */
export const useHistory = (address: string, network: Network) =>
{
    const [ items, setItems ] = useState<Transaction[]>([]);
    const [ loading, setLoading ] = useState(true);

    const api = getExplorerApi(network);

    useEffect(() =>
    {
        let active = true;

        const run = async() =>
        {
            if (api.length === 0)
            {
                setItems([]);
                setLoading(false);

                return;
            }

            setLoading(true);

            const results = await Promise.all([ 'txlist', 'tokentx' ].map(async(action) => readAction(action, address, network).catch((): Transaction[] => [])));

            if (!active)
            {
                return;
            }

            const merged = results.flat().sort((left, right) => right.timestamp - left.timestamp);

            setItems(merged.slice(0, pageSize));
            setLoading(false);
        };

        void run();

        return () =>
        {
            active = false;
        };
    }, [ address, network.id, api ]);

    return { items, loading };
};
