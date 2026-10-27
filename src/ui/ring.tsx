import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { cn } from '../utility/cn';
import { focusRing } from './token';
import { useDialog } from './dialog';
import { layer } from './container';
import { spring, transition } from './motion';
import { ringLabel, ringSlice } from '../utility/ring';

import type { Point } from '../type/app';

const ring = { box: 216, inner: 56, outer: 104, gap: 4, corner: 6 };

// Kept this far inside the window when the mouse sits near an edge.
const edge = 8;

const fit = (value: number, room: number) => Math.min(Math.max(value - ring.box / 2, edge), Math.max(room - ring.box - edge, edge));

export interface RingChoice {
    key: string;
    label: string;
    /** Drawn in place of the label, which then only reads out. */
    icon?: ReactNode;
    disabled?: boolean;
    onPick: () => void;
}

/**
 * Choices laid round a hub that closes them, popped over the floating mouse with the hub where the
 * mouse was, or in the middle of the window when it is not known where that is. A dialog to the
 * rest of the app, so a browser tab steps aside for it and Escape or Android's back closes it.
 * Each slice is a whole button clipped to its shape, so a press lands only on the slice it shows.
 */
export function RingMenu({
    at,
    choices,
    hub,
    hubLabel,
    onClose
}: {
    at: Point | undefined;
    choices: RingChoice[];
    hub: ReactNode;
    hubLabel: string;
    onClose: () => void;
}) {
    const { panelRef } = useDialog(onClose);

    const reduced = useReducedMotion() === true;

    return (
        <>
            {/* Unseen: it only takes a press outside the ring, which closes it. */}
            <div className={cn('fixed inset-0', layer.dialog)} onClick={onClose} />

            <div
                style={{
                    left: fit(at?.x ?? window.innerWidth / 2, window.innerWidth),
                    top: fit(at?.y ?? window.innerHeight / 2, window.innerHeight)
                }}
                className={cn('pointer-events-none fixed', layer.dialog)}
            >
                <motion.div
                    ref={panelRef}
                    role='dialog'
                    tabIndex={-1}
                    initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
                    animate={{ opacity: 1, scale: 1, transition: { ...spring.entrance, opacity: transition.fade } }}
                    exit={{ opacity: 0, scale: reduced ? 1 : 0.85, transition: transition.dismiss }}
                    style={{ width: ring.box, height: ring.box }}
                    className='pointer-events-auto relative shrink-0 rounded-full bg-line shadow-float outline-none'
                >
                    {choices.map((choice, index) => {
                        const at = ringLabel(index, choices.length, ring);

                        return (
                            <button
                                key={choice.key}
                                type='button'
                                disabled={choice.disabled}
                                onClick={choice.onPick}
                                style={{ clipPath: `path('${ringSlice(index, choices.length, ring)}')` }}
                                className='absolute inset-0 cursor-pointer bg-base-2 text-txt-normal transition-colors duration-(--duration-fast) outline-none enabled:hover:bg-btn-primary enabled:hover:text-txt-on-primary enabled:focus-visible:bg-btn-primary enabled:focus-visible:text-txt-on-primary enabled:active:bg-btn-primary-active enabled:active:text-txt-on-primary disabled:cursor-default disabled:text-txt-muted/60'
                            >
                                {/* Placed by the ring's own geometry, which is the same whichever way the text runs. */}
                                <span
                                    style={{ left: at.x, top: at.y }}
                                    className='absolute w-20 -translate-x-1/2 -translate-y-1/2 text-center text-tiny leading-tight font-semibold'
                                >
                                    {choice.icon ?? choice.label}
                                </span>

                                {choice.icon !== undefined && <span className='sr-only'>{choice.label}</span>}
                            </button>
                        );
                    })}

                    <button
                        type='button'
                        onClick={onClose}
                        className={cn(
                            focusRing,
                            'absolute inset-0 m-auto flex size-22 press cursor-pointer items-center justify-center rounded-full bg-base-2'
                        )}
                    >
                        {hub}

                        <span className='sr-only'>{hubLabel}</span>
                    </button>
                </motion.div>
            </div>
        </>
    );
}
