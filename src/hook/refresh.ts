import { useCallback, useRef, useState } from 'react';

/**
 * A read that can be asked for again and waited on: `refresh` settles once the read it started has
 * answered, failed, or been dropped for a newer one. `claim` is called at the top of the effect
 * that reads, and hands back what tells those waiting that this run is over.
 *
 * Each run takes its own waiters. One list emptied on cleanup would let the run a refresh replaces
 * answer for the one it starts, and whoever pulled to refresh would be told at once.
 */
export const useRefresh = () => {
    const [nonce, setNonce] = useState(0);

    const waiting = useRef<(() => void)[]>([]);

    const refresh = useCallback(
        async () =>
            new Promise<void>((resolve) => {
                waiting.current.push(resolve);

                setNonce((current) => current + 1);
            }),
        []
    );

    const claim = useCallback(() => {
        const held = waiting.current.splice(0);

        return () => {
            for (const resolve of held.splice(0)) {
                resolve();
            }
        };
    }, []);

    return { nonce, refresh, claim };
};
