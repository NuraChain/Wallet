import { useEffect, useState } from 'react';

type ClipboardState = 'idle' | 'done' | 'failed';

export const useClipboard = (reset = 1400) => {
    const [state, setState] = useState<ClipboardState>('idle');

    useEffect(() => {
        if (state === 'idle' || reset <= 0) {
            return undefined;
        }

        const timer = setTimeout(() => {
            setState('idle');
        }, reset);

        return () => {
            clearTimeout(timer);
        };
    }, [state, reset]);

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);

            setState('done');
        } catch {
            setState('failed');
        }
    };

    return { state, copy };
};
