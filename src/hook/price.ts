import { useEffect, useMemo, useState } from 'react';

import { getNativeCoinId, readPrices, type PriceMap } from '../core/price';

import type { Network } from '../core/network';
import type { TokenBalance } from '../core/token';

/**
 * Read USD prices for the native coin and every held token, and total them into one portfolio value.
 *
 * The total is what the wallet tab shows in place of a raw coin amount, so an asset whose price could not be resolved contributes zero rather than blocking the figure — a partial total beats no total.
 * @param {Network} network Active network (selects the native coin).
 * @param {string} nativeFormatted Native balance as a decimal string.
 * @param {TokenBalance[]} tokens Token balances to price.
 * @returns {{ prices: PriceMap; total: number; loading: boolean }} Prices, the summed USD value, and whether the lookup is still running.
 */
export const usePrices = (network: Network, nativeFormatted: string, tokens: TokenBalance[]) =>
{
    const [ prices, setPrices ] = useState<PriceMap>({});
    const [ loading, setLoading ] = useState(true);

    const nativeId = getNativeCoinId(network.chainId);
    const ids = useMemo(() => [ nativeId, ...tokens.map((item) => item.token.coinId) ].filter((id) => id.length > 0), [ nativeId, tokens ]);

    const key = ids.join(',');

    useEffect(() =>
    {
        let active = true;

        const run = async() =>
        {
            setLoading(true);

            try
            {
                const result = await readPrices(key.split(',').filter((id) => id.length > 0));

                if (active)
                {
                    setPrices(result);
                }
            }
            catch
            {
                if (active)
                {
                    setPrices({});
                }
            }
            finally
            {
                if (active)
                {
                    setLoading(false);
                }
            }
        };

        void run();

        return () =>
        {
            active = false;
        };
    }, [ key ]);

    const total = useMemo(() =>
    {
        const nativePrice = prices[nativeId] ?? 0;

        let sum = Number(nativeFormatted) * nativePrice;

        for (const item of tokens)
        {
            sum += Number(item.formatted) * (prices[item.token.coinId] ?? 0);
        }

        return Number.isFinite(sum) ? sum : 0;
    }, [ prices, nativeId, nativeFormatted, tokens ]);

    return { prices, total, loading };
};
