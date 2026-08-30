import { formatEther } from 'ethers';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOnline } from './connection';
import { isOnline } from '../core/connection';
import type { Network } from '../core/network';

import { getProvider } from '../core/network.provider';
import { balanceKey, readBalances, readLastBalances, readLastNative, readNative, writeBalances, writeNative } from '../core/token.cache';
import { readTokenBalances, type Token, type TokenBalance } from '../core/token';

export const useBalance = (address: string, network: Network) => {
    const [held, setHeld] = useState({ key: '', value: 0n, at: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [nonce, setNonce] = useState(0);

    const online = useOnline();

    const key = `${address}@${network.id}`;

    const fresh = held.key === key;

    const lastNonce = useRef(nonce);

    const refresh = useCallback(() => {
        setNonce((current) => current + 1);
    }, []);

    useEffect(() => {
        let active = true;

        const hit = readNative(key);
        const forced = nonce !== lastNonce.current;

        lastNonce.current = nonce;

        if (hit !== undefined) {
            setHeld({ key, value: hit.value, at: hit.written });
            setLoading(false);
            setError(false);

            if (hit.fresh && !forced) {
                return () => {
                    active = false;
                };
            }
        }

        const unreachable = () => {
            setError(true);
            setLoading(false);

            if (hit !== undefined) {
                return;
            }

            const last = readLastNative(key);

            if (last === undefined) {
                setHeld({ key, value: 0n, at: 0 });
            } else {
                setHeld({ key, value: last.value, at: last.written });
            }
        };

        const run = async () => {
            setLoading(hit === undefined);
            setError(false);

            if (!isOnline()) {
                unreachable();

                return;
            }

            try {
                const balance = await getProvider().getBalance(address);

                if (active) {
                    writeNative(key, balance);

                    setHeld({ key, value: balance, at: Date.now() });
                    setLoading(false);
                }
            } catch {
                if (active) {
                    unreachable();
                }
            }
        };

        void run();

        return () => {
            active = false;
        };
    }, [key, nonce, online]);

    const value = fresh ? held.value : 0n;

    return { value, formatted: formatEther(value), loading: loading || !fresh, error, at: fresh ? held.at : 0, refresh };
};

export const useTokens = (address: string, network: Network, list: Token[]) => {
    const [held, setHeld] = useState<{ key: string; tokens: TokenBalance[]; at: number }>({ key: '', tokens: [], at: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [nonce, setNonce] = useState(0);

    const online = useOnline();

    const key = `${address}@${network.id}`;

    const listKey = list.map((item) => item.address).join(',');

    const fresh = held.key === key;

    const cacheKey = balanceKey(address, network.id, list);

    const lastNonce = useRef(nonce);

    const refresh = useCallback(() => {
        setNonce((current) => current + 1);
    }, []);

    useEffect(() => {
        let active = true;

        const hit = readBalances(cacheKey, list);
        const forced = nonce !== lastNonce.current;

        lastNonce.current = nonce;

        if (hit !== undefined) {
            setHeld({ key, tokens: hit.tokens, at: hit.written });
            setLoading(false);
            setError(false);

            if (hit.fresh && !forced) {
                return () => {
                    active = false;
                };
            }
        }

        const unreachable = () => {
            setError(true);
            setLoading(false);

            if (hit !== undefined) {
                return;
            }

            const last = readLastBalances(cacheKey, list);

            setHeld({ key, tokens: last?.tokens ?? [], at: last?.written ?? 0 });
        };

        const run = async () => {
            setLoading(hit === undefined);
            setError(false);

            if (!isOnline()) {
                unreachable();

                return;
            }

            try {
                const result = await readTokenBalances(address, list);

                if (active) {
                    writeBalances(cacheKey, result);

                    setHeld({ key, tokens: result, at: Date.now() });
                    setLoading(false);
                }
            } catch {
                if (active) {
                    unreachable();
                }
            }
        };

        void run();

        return () => {
            active = false;
        };
    }, [key, listKey, nonce, cacheKey, online]);

    return { tokens: fresh ? held.tokens : [], loading: loading || !fresh, error, at: fresh ? held.at : 0, refresh };
};
