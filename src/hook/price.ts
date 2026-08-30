import { useEffect, useMemo, useState } from 'react';

import { useOnline } from './connection';
import { getNativeCoinId, getTokenCoinId, readPrices, type PriceMap } from '../core/price';

import type { Network } from '../core/network';
import type { TokenBalance } from '../core/token';

export const usePrices = (network: Network, nativeFormatted: string, tokens: TokenBalance[]) => {
    const [held, setHeld] = useState<{ prices: PriceMap; at: number }>({ prices: {}, at: 0 });
    const [loading, setLoading] = useState(true);

    const online = useOnline();

    const nativeId = getNativeCoinId(network.chainId);
    const ids = useMemo(
        () => [nativeId, ...tokens.map((item) => getTokenCoinId(network.chainId, item.token.address, item.token.coinId))].filter((id) => id.length > 0),
        [nativeId, network.chainId, tokens]
    );

    const key = ids.join(',');

    useEffect(() => {
        let active = true;

        const run = async () => {
            setLoading(true);

            const result = await readPrices(key.split(',').filter((id) => id.length > 0)).catch(() => null);

            if (active) {
                if (result) {
                    setHeld(result);
                }

                setLoading(false);
            }
        };

        void run();

        return () => {
            active = false;
        };
    }, [key, online]);

    const total = useMemo(() => {
        const nativePrice = held.prices[nativeId] ?? 0;

        let sum = Number(nativeFormatted) * nativePrice;

        for (const item of tokens) {
            sum += Number(item.formatted) * (held.prices[getTokenCoinId(network.chainId, item.token.address, item.token.coinId)] ?? 0);
        }

        return Number.isFinite(sum) ? sum : 0;
    }, [held, nativeId, network.chainId, nativeFormatted, tokens]);

    return { prices: held.prices, total, loading, at: held.at };
};
