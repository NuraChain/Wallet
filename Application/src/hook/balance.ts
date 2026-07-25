import { formatEther } from 'ethers';
import { useCallback, useEffect, useState } from 'react';

import { getProvider, type Network } from '../core/network';
import { readTokenBalances, type TokenBalance } from '../core/token';

/**
 * Read the native-coin balance of an account on a network.
 *
 * Refetches whenever the address or network changes, and exposes a manual `refresh`. RPC failures surface through `error` and leave the last good value untouched.
 * @param {string} address Account address to query.
 * @param {Network} network Active network.
 * @returns {{ value: bigint; formatted: string; loading: boolean; error: boolean; refresh: () => void }} Native balance state.
 */
export const useBalance = (address: string, network: Network) =>
{
    const [ value, setValue ] = useState(0n);
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState(false);
    const [ nonce, setNonce ] = useState(0);

    const refresh = useCallback(() =>
    {
        setNonce((current) => current + 1);
    }, []);

    useEffect(() =>
    {
        let active = true;

        const run = async() =>
        {
            setLoading(true);
            setError(false);

            try
            {
                const balance = await getProvider().getBalance(address);

                if (active)
                {
                    setValue(balance);
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
    }, [ address, network.id, nonce ]);

    return { value, formatted: formatEther(value), loading, error, refresh };
};

/**
 * Read every curated ERC20 balance for an account on a network.
 *
 * Refetches whenever the address or network changes, and exposes a manual `refresh`.
 * @param {string} address Account address to query.
 * @param {Network} network Active network.
 * @returns {{ tokens: TokenBalance[]; loading: boolean; error: boolean; refresh: () => void }} Token balance state.
 */
export const useTokens = (address: string, network: Network) =>
{
    const [ tokens, setTokens ] = useState<TokenBalance[]>([]);
    const [ loading, setLoading ] = useState(true);
    const [ error, setError ] = useState(false);
    const [ nonce, setNonce ] = useState(0);

    const refresh = useCallback(() =>
    {
        setNonce((current) => current + 1);
    }, []);

    useEffect(() =>
    {
        let active = true;

        const run = async() =>
        {
            setLoading(true);
            setError(false);

            try
            {
                const result = await readTokenBalances(address, network);

                if (active)
                {
                    setTokens(result);
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
    }, [ address, network.id, nonce ]);

    return { tokens, loading, error, refresh };
};
