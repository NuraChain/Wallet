import { useCallback, useRef, useState } from 'react';

/** Each run takes its own waiters, or the run a refresh replaces would answer for the new one and end the pull at once. */
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
