import type { Network } from '../core/network';

import { useEffect, useState } from 'react';

/**
 * A single account transaction as shown in the activity list.
 */
export interface Transaction
{
    hash: string;
    from: string;
    to: string;
    value: string;
    symbol: string;
    timestamp: number;
    incoming: boolean;
}

/**
 * Read the transaction history for an account on a network.
 *
 * Plain JSON-RPC cannot enumerate past transactions, so live history needs an Etherscan-style indexer. Until an API key is wired in below, this returns an empty list; the UI renders a "needs API" empty state rather than faking data.
 * @param {string} address Account address to query.
 * @param {Network} network Active network.
 * @returns {{ items: Transaction[]; loading: boolean }} History state.
 */
export const useHistory = (address: string, network: Network) =>
{
    const [ items, setItems ] = useState<Transaction[]>([]);
    const [ loading, setLoading ] = useState(false);

    useEffect(() =>
    {
        // Indexer seam — an Etherscan-style API goes here, e.g.
        //   GET {network.explorerApi}?module=account&action=txlist&address={address}&apikey={key}
        // then map the response into Transaction[] and call setItems(...).
        setItems([]);
        setLoading(false);
    }, [ address, network.id ]);

    return { items, loading };
};
