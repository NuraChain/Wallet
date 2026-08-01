import { useEffect, useState } from 'react';

/**
 * What the last copy attempt did. `idle` is also what the hook returns to once the acknowledgement
 * has been shown for long enough.
 */
export type ClipboardState = 'idle' | 'done' | 'failed';

/**
 * Copy text to the clipboard and report how it went.
 *
 * The wallet tab and the receive dialog both wrote their own copy handler, their own success flag and
 * their own timer to clear it. The gesture is one gesture, so the state machine behind it is here:
 * the caller decides only how to show it — a glyph that flips for a moment, or a line of text.
 *
 * `reset` is how long the acknowledgement stays up. Passing `0` holds it indefinitely, which is what
 * a dialog that closes on its own wants.
 * @param {number} [reset] Milliseconds before returning to `idle`, or `0` to stay.
 * @returns {{ state: ClipboardState; copy: (value: string) => Promise<void> }} The state and the copy action.
 */
export const useClipboard = (reset = 1400) =>
{
    const [ state, setState ] = useState<ClipboardState>('idle');

    useEffect(() =>
    {
        if (state === 'idle' || reset <= 0)
        {
            return undefined;
        }

        const timer = setTimeout(() => { setState('idle'); }, reset);

        return () => { clearTimeout(timer); };
    }, [ state, reset ]);

    const copy = async(value: string) =>
    {
        try
        {
            await navigator.clipboard.writeText(value);

            setState('done');
        }
        catch
        {
            setState('failed');
        }
    };

    return { state, copy };
};
