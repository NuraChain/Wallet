import { formatEther } from 'ethers';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getProvider, type Network } from '../core/network';
import { balanceKey, readBalances, readNative, writeBalances, writeNative } from '../core/token.cache';
import { readTokenBalances, type Token, type TokenBalance } from '../core/token';

/**
 * Read the native-coin balance of an account on a network.
 *
 * Refetches whenever the address or network changes, and exposes a manual `refresh`. RPC failures surface through `error` and leave the last good value untouched.
 *
 * What is held is tagged with the account and chain it was read for, and anything else counts as still
 * loading. A balance is only true of the chain it came from, and the old one used to be served for as
 * long as the new read took — under the new chain's symbol, since the label had already switched. It
 * is not enough to raise `loading` when the request starts: that happens in an effect, one render
 * after the network changed, so the wrong number was on screen before the flag could say otherwise.
 * @param {string} address Account address to query.
 * @param {Network} network Active network.
 * @returns {{ value: bigint; formatted: string; loading: boolean; error: boolean; refresh: () => void }} Native balance state.
 */
export const useBalance = (address: string, network: Network) =>
{
    const [ held, setHeld ] = useState({ key: '', value: 0n });
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState(false);
    const [ nonce, setNonce ] = useState(0);

    const key = `${ address }@${ network.id }`;

    const fresh = held.key === key;

    const lastNonce = useRef(nonce);

    const refresh = useCallback(() =>
    {
        setNonce((current) => current + 1);
    }, []);

    useEffect(() =>
    {
        let active = true;

        // Stale-while-revalidate, matching the token rows below this figure so the two arrive together
        // rather than the list beating the headline. Session-only, like every balance here.
        const hit = readNative(key);
        const forced = nonce !== lastNonce.current;

        lastNonce.current = nonce;

        if (hit !== undefined)
        {
            setHeld({ key, value: hit.value });
            setLoading(false);
            setError(false);

            if (hit.fresh && !forced)
            {
                return () => { active = false; };
            }
        }

        const run = async() =>
        {
            setLoading(hit === undefined);
            setError(false);

            try
            {
                const balance = await getProvider().getBalance(address);

                if (active)
                {
                    writeNative(key, balance);

                    setHeld({ key, value: balance });
                }
            }
            catch
            {
                if (active)
                {
                    setError(true);
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
    }, [ key, nonce ]);

    const value = fresh ? held.value : 0n;

    return { value, formatted: formatEther(value), loading: loading || !fresh, error, refresh };
};

/**
 * Read the balances of the tokens the user added on a network.
 *
 * The list is passed in rather than looked up, because nothing is tracked by default — the dashboard owns the added-token state and this hook only turns it into balances. Refetches whenever the address, network or list changes, and exposes a manual `refresh`.
 *
 * Tagged with the account and chain it was read for, like the native balance above, and for a worse
 * reason: these rows carry their own symbols, so the previous chain's holdings stayed on screen after
 * a switch looking like they belonged to the new one. The tag deliberately leaves the token list out —
 * adding one should let the rest keep their balances while the new one is read, not blank the list.
 * @param {string} address Account address to query.
 * @param {Network} network Active network.
 * @param {Token[]} list Tokens the user added on this network.
 * @returns {{ tokens: TokenBalance[]; loading: boolean; error: boolean; refresh: () => void }} Token balance state.
 */
export const useTokens = (address: string, network: Network, list: Token[]) =>
{
    const [ held, setHeld ] = useState<{ key: string; tokens: TokenBalance[] }>({ key: '', tokens: [] });
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState(false);
    const [ nonce, setNonce ] = useState(0);

    const key = `${ address }@${ network.id }`;

    const listKey = list.map((item) => item.address).join(',');

    const fresh = held.key === key;

    // The cache key carries the contract list the tag deliberately leaves out: what was read is only an
    // answer for the tokens it was handed, while the tag answers a different question — whether these
    // rows belong to the account on screen.
    const cacheKey = balanceKey(address, network.id, list);

    const lastNonce = useRef(nonce);

    const refresh = useCallback(() =>
    {
        setNonce((current) => current + 1);
    }, []);

    useEffect(() =>
    {
        let active = true;

        // Stale-while-revalidate. Held balances are shown at once and the chain is re-read behind them,
        // so returning to an account already visited this session shows its last known amounts instead
        // of an empty list. Nothing here is written to disk — see the note in `token.cache.ts`; a
        // balance from a previous launch is not a balance worth rendering as current.
        const hit = readBalances(cacheKey, list);
        const forced = nonce !== lastNonce.current;

        lastNonce.current = nonce;

        if (hit !== undefined)
        {
            setHeld({ key, tokens: hit.tokens });
            setLoading(false);
            setError(false);

            if (hit.fresh && !forced)
            {
                return () => { active = false; };
            }
        }

        const run = async() =>
        {
            setLoading(hit === undefined);
            setError(false);

            try
            {
                const result = await readTokenBalances(address, list);

                if (active)
                {
                    writeBalances(cacheKey, result);

                    setHeld({ key, tokens: result });
                }
            }
            catch
            {
                if (active)
                {
                    setError(true);
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
    }, [ key, listKey, nonce, cacheKey ]);

    return { tokens: fresh ? held.tokens : [], loading: loading || !fresh, error, refresh };
};
