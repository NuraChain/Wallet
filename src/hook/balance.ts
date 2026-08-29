import { formatEther } from 'ethers';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOnline } from './connection';
import { isOnline } from '../core/connection';
import type { Network } from '../core/network';

import { getProvider } from '../core/network.provider';
import { balanceKey, readBalances, readLastBalances, readLastNative, readNative, writeBalances, writeNative } from '../core/token.cache';
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
 *
 * A read that cannot happen at all — no link — or one that fails outright falls back to the last
 * balance this account was ever seen to hold, and says so through `error` and `at`. The alternative is
 * `0`, and zero is a number the user believes: an unreachable chain must not be able to tell someone
 * their wallet is empty. `at` is when the figure on screen was actually read, and `0` means it never
 * was, which is the caller's signal to render no figure rather than a fabricated one.
 * @param {string} address Account address to query.
 * @param {Network} network Active network.
 * @returns {{ value: bigint; formatted: string; loading: boolean; error: boolean; at: number; refresh: () => void }} Native balance state.
 */
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

        // Stale-while-revalidate, matching the token rows below this figure so the two arrive together
        // rather than the list beating the headline. Session-only, like every balance here.
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

        /**
         * unreachable - What to show when the chain could not be asked, or would not answer.
         *
         * The session entry above already covers the case where this account was read earlier in the
         * run; this is the launch that starts offline, where the only thing left is what the previous
         * run saw.
         */
        const unreachable = () => {
            setError(true);
            setLoading(false);

            if (hit !== undefined) {
                return;
            }

            const last = readLastNative(key);

            if (last === undefined) {
                // Nothing was ever read for this account. `at` stays zero, which is what tells the tab
                // to show no balance at all rather than a zero it cannot stand behind.
                setHeld({ key, value: 0n, at: 0 });
            } else {
                setHeld({ key, value: last.value, at: last.written });
            }
        };

        const run = async () => {
            setLoading(hit === undefined);
            setError(false);

            // Skipped rather than attempted: the provider would spend its timeouts arriving at an
            // answer already known, and the fallback below is the same one it would reach anyway.
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
        // `online` is a dependency so that a link coming back re-reads on its own, rather than leaving
        // the user looking at a stale figure until they think to pull down.
    }, [key, nonce, online]);

    const value = fresh ? held.value : 0n;

    return { value, formatted: formatEther(value), loading: loading || !fresh, error, at: fresh ? held.at : 0, refresh };
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
 *
 * Falls back to the last balances this account was seen to hold when the chain cannot be reached, for
 * the same reason the coin balance does — an empty holdings list reads as "you own nothing", which is
 * not what an unreachable RPC means.
 * @param {string} address Account address to query.
 * @param {Network} network Active network.
 * @param {Token[]} list Tokens the user added on this network.
 * @returns {{ tokens: TokenBalance[]; loading: boolean; error: boolean; at: number; refresh: () => void }} Token balance state.
 */
export const useTokens = (address: string, network: Network, list: Token[]) => {
    const [held, setHeld] = useState<{ key: string; tokens: TokenBalance[]; at: number }>({ key: '', tokens: [], at: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [nonce, setNonce] = useState(0);

    const online = useOnline();

    const key = `${address}@${network.id}`;

    const listKey = list.map((item) => item.address).join(',');

    const fresh = held.key === key;

    // The cache key carries the contract list the tag deliberately leaves out: what was read is only an
    // answer for the tokens it was handed, while the tag answers a different question — whether these
    // rows belong to the account on screen.
    const cacheKey = balanceKey(address, network.id, list);

    const lastNonce = useRef(nonce);

    const refresh = useCallback(() => {
        setNonce((current) => current + 1);
    }, []);

    useEffect(() => {
        let active = true;

        // Stale-while-revalidate. Held balances are shown at once and the chain is re-read behind them,
        // so returning to an account already visited this session shows its last known amounts instead
        // of an empty list. What this writes to disk is only reached for when the chain cannot be
        // reached at all — see the note in `token.cache.ts`.
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

        /** unreachable - What to show when the contracts could not be read. */
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
