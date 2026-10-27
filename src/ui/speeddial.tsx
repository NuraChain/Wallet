import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

import { cn } from '../utility/cn';
import { focusRing } from './token';
import { useDismiss } from './dialog';
import { layer } from './container';
import { transition } from './motion';

import type { Point } from '../type/app';

export interface SpeedAction {
    key: string;
    label: string;
    icon: ReactNode;
    disabled?: boolean;
    onPick: () => void;
}

const size = 48;

const half = size / 2;

// The floating mouse is 40px on every platform; each button's edge stands this far from its edge.
const hub = 40;

const gap = 10;

const radius = hub / 2 + gap + half;

const edge = 8;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(high, low));

// The first action sits at twelve o'clock and the rest follow clockwise, so the menu reads like a clock face.
const spot = (index: number, count: number): Point => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;

    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
};

interface Stagger {
    index: number;
    count: number;
    target: Point;
    pull: number;
    shrink: number;
}

// Out from part-way toward the centre, one after another clockwise; back the other way when it collapses.
const buttonMotion = {
    open: ({ index, target }: Stagger) => ({
        x: target.x - half,
        y: target.y - half,
        opacity: 1,
        scale: 1,
        transition: { ...transition.reveal, delay: index * 0.04 }
    }),
    closed: ({ index, count, target, pull, shrink }: Stagger) => ({
        x: target.x * pull - half,
        y: target.y * pull - half,
        opacity: 0,
        scale: shrink,
        transition: { ...transition.dismiss, delay: (count - 1 - index) * 0.03 }
    })
};

// Each label sits outward from its button, so it never lies over the mouse or another button.
const labelMap = {
    start: 'inset-s-full top-1/2 ms-3 -translate-y-1/2',
    end: 'inset-e-full top-1/2 me-3 -translate-y-1/2',
    above: 'bottom-full start-1/2 mb-3 -translate-x-1/2 rtl:translate-x-1/2',
    below: 'top-full start-1/2 mt-3 -translate-x-1/2 rtl:translate-x-1/2'
} as const;

const labelSide = ({ x, y }: Point): keyof typeof labelMap => {
    if (Math.abs(x) < 4) {
        return y < 0 ? 'above' : 'below';
    }

    return x > 0 ? 'start' : 'end';
};

/**
 * Buttons laid on a circle round a point, with the point left clear for whatever is drawn there: the floating mouse.
 * Opening and collapsing are the parent's to say, through `open`; a press outside or Escape asks for it through
 * `onDismiss`, and `onClosed` runs once the collapse has finished, so a parent that unmounts on it sees the menu leave.
 */
export function SpeedDial({
    actions,
    at,
    open,
    onDismiss,
    onClosed
}: {
    actions: SpeedAction[];
    at: Point | undefined;
    open: boolean;
    onDismiss: () => void;
    onClosed: () => void;
}) {
    const reduced = useReducedMotion() === true;

    useDismiss(open, onDismiss);

    const centre = at ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    // The whole ring stays on screen; a mouse at the very edge therefore sits a little off the ring's middle.
    const reach = radius + half + edge;
    const left = clamp(centre.x, reach, window.innerWidth - reach);
    const top = clamp(centre.y, reach, window.innerHeight - reach);

    return (
        <>
            <div inert={!open} onClick={onDismiss} className={cn('fixed inset-0', layer.dialog, open ? 'opacity-100' : 'opacity-0')} />

            <div style={{ left, top }} className={cn('fixed size-0', layer.dialog)}>
                {actions.map((action, index) => {
                    const target = spot(index, actions.length);

                    return (
                        <motion.div
                            key={action.key}
                            custom={{ index, count: actions.length, target, pull: reduced ? 1 : 0.4, shrink: reduced ? 1 : 0.5 } satisfies Stagger}
                            variants={buttonMotion}
                            initial='closed'
                            animate={open ? 'open' : 'closed'}
                            onAnimationComplete={index === 0 && !open ? () => onClosed() : undefined}
                            inert={!open}
                            className='absolute top-0 left-0'
                        >
                            <button
                                type='button'
                                disabled={action.disabled}
                                onClick={action.onPick}
                                className={cn(
                                    focusRing,
                                    'group relative flex size-12 cursor-pointer items-center justify-center rounded-full border border-line bg-base-2 text-txt-normal shadow-float transition-colors duration-(--duration-fast) outline-none enabled:hover:bg-btn-primary enabled:hover:text-txt-on-primary enabled:focus-visible:bg-btn-primary enabled:focus-visible:text-txt-on-primary disabled:cursor-default disabled:text-txt-muted/60'
                                )}
                            >
                                {action.icon}

                                <span
                                    className={cn(
                                        'pointer-events-none absolute rounded-control border border-line bg-base-2 px-2 py-1 text-tiny leading-tight font-semibold whitespace-nowrap text-txt-normal opacity-0 shadow-float transition-opacity duration-(--duration-fast) group-hover:opacity-100 group-focus-visible:opacity-100',
                                        labelMap[labelSide(target)]
                                    )}
                                >
                                    {action.label}
                                </span>
                            </button>
                        </motion.div>
                    );
                })}
            </div>
        </>
    );
}
