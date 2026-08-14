import { useEffect, useMemo, useState } from 'react';

import { useOnline } from './connection';
import { getNativeCoinId, readPrices, type PriceMap } from '../core/price';

import type { Network } from '../core/network';
import type { TokenBalance } from '../core/token';

/**
 * Read USD prices for the native coin and every held token, and total them into one portfolio value.
 *
 * The total is what the wallet tab shows in place of a raw coin amount, so an asset whose price could not be resolved contributes zero rather than blocking the figure — a partial total beats no total.
 *
 * `at` says when the oldest price behind the figure was read, and it is `0` when there are no prices at
 * all. That is not the same as a portfolio worth nothing, and the tab renders the two differently: a
 * total drawn from held prices is shown with its age, a total that could never be computed is not shown
 * at all. Prices come off disk before the endpoint is asked, so this survives a launch with no
 * connection instead of collapsing to `$0.00`.
 * @param {Network} network Active network (selects the native coin).
 * @param {string} nativeFormatted Native balance as a decimal string.
 * @param {TokenBalance[]} tokens Token balances to price.
 * @returns {{ prices: PriceMap; total: number; loading: boolean; at: number }} Prices, the summed USD value, whether the lookup is still running, and how current the figure is.
 */
export const usePrices = (network: Network, nativeFormatted: string, tokens: TokenBalance[]) =>
{
    const [ held, setHeld ] = useState<{ prices: PriceMap; at: number }>({ prices: {}, at: 0 });
    const [ loading, setLoading ] = useState(true);

    const online = useOnline();

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
                    setHeld(result);
                }
            }
            catch
            {
                // `readPrices` resolves on every path, so this only covers something unforeseen inside
                // it. Held prices are kept rather than cleared: the last known valuation is still the
                // best one available, and blanking it would be the failure showing up as money.
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
        // `online` is a dependency rather than a condition: a link that comes back is exactly when the
        // held prices are worth replacing, and this is the cheapest place to notice.
    }, [ key, online ]);

    const total = useMemo(() =>
    {
        const nativePrice = held.prices[nativeId] ?? 0;

        let sum = Number(nativeFormatted) * nativePrice;

        for (const item of tokens)
        {
            sum += Number(item.formatted) * (held.prices[item.token.coinId] ?? 0);
        }

        return Number.isFinite(sum) ? sum : 0;
    }, [ held, nativeId, nativeFormatted, tokens ]);

    return { prices: held.prices, total, loading, at: held.at };
};
