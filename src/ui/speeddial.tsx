import { motion, useReducedMotion } from 'motion/react';
import { Globe, Maximize2, Minimize2, Wallet } from 'lucide-react';

import { cn } from '../utility/cn';
import { focusRing } from './token';
import { useDismiss } from './dialog';
import { layer } from './container';
import { transition } from './motion';
import { menuButton, menuRadius, menuReach } from '../core/mouse';

import type { MouseGlyph, MouseMenuItem, Point } from '../type/app';

export interface SpeedAction extends MouseMenuItem {
    onPick: () => void;
}

const glyphMap = { wallet: Wallet, browser: Globe, full: Maximize2, exit: Minimize2 } as const satisfies Record<MouseGlyph, unknown>;

const half = menuButton / 2;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(high, low));

// The first action sits at twelve o'clock and the rest follow clockwise, so the menu reads like a clock face.
const spot = (index: number, count: number): Point => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;

    return { x: Math.cos(angle) * menuRadius, y: Math.sin(angle) * menuRadius };
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

/**
 * Buttons laid on a circle round a point, with the point left clear for whatever is drawn there: the floating mouse.
 * Opening and collapsing are the parent's to say, through `open`; a press outside or Escape asks for it through
 * `onDismiss`, and `onClosed` runs once the collapse has finished, so a parent that unmounts on it sees the menu leave.
 * A button's name shows as the system's own tooltip, which no edge of a small webview can cut off.
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
    const left = clamp(centre.x, menuReach, window.innerWidth - menuReach);
    const top = clamp(centre.y, menuReach, window.innerHeight - menuReach);

    return (
        <>
            <div inert={!open} onClick={onDismiss} className={cn('fixed inset-0', layer.dialog, open ? 'opacity-100' : 'opacity-0')} />

            <div style={{ left, top }} className={cn('fixed size-0', layer.dialog)}>
                {actions.map((action, index) => {
                    const target = spot(index, actions.length);

                    const Glyph = glyphMap[action.glyph];

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
                                title={action.label}
                                disabled={action.disabled}
                                onClick={action.onPick}
                                className={cn(
                                    focusRing,
                                    'flex size-12 press cursor-pointer items-center justify-center rounded-full border border-line bg-base-2 text-txt-normal outline-none enabled:hover:bg-btn-primary enabled:hover:text-txt-on-primary enabled:focus-visible:bg-btn-primary enabled:focus-visible:text-txt-on-primary disabled:cursor-default disabled:text-txt-muted/60'
                                )}
                            >
                                <Glyph size={22} />

                                <span className='sr-only'>{action.label}</span>
                            </button>
                        </motion.div>
                    );
                })}
            </div>
        </>
    );
}
