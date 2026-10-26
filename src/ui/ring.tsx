import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { cn } from '../utility/cn';
import { focusRing } from './token';
import { useDialog } from './dialog';
import { inset, layer } from './container';
import { spring, transition } from './motion';
import { ringLabel, ringSlice } from '../utility/ring';

const ring = { box: 216, inner: 56, outer: 104, gap: 4, corner: 6 };

export interface RingChoice {
    key: string;
    label: string;
    disabled?: boolean;
    onPick: () => void;
}

/**
 * Choices laid round a hub that closes them, over a scrim: what the floating mouse opens. A dialog
 * like any other, so a browser tab steps aside for it and Escape or Android's back closes it.
 * Each slice is a whole button clipped to its shape, so a press lands only on the slice it shows.
 */
export function RingMenu({ choices, hub, hubLabel, onClose }: { choices: RingChoice[]; hub: ReactNode; hubLabel: string; onClose: () => void }) {
    const { panelRef } = useDialog(onClose);

    const reduced = useReducedMotion() === true;

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition.overlay}
                className={cn('absolute size-full cursor-pointer bg-scrim', layer.dialog)}
                onClick={onClose}
            />

            <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center', inset.modalFrame, layer.dialog)}>
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
                                    {choice.label}
                                </span>
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
