import type { CSSProperties, ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import Button from './button';

import { cn } from '../utility/cn';
import { transition } from './motion';

/**
 * The dashboard's bottom bar: a pill of tabs with one round action beside it.
 * It sits in the flow under the pages rather than over them, because a browser tab is a native view that no overlay reaches;
 * so it also owns the bottom inset the pages above it would otherwise pad for. Put it in an `AnimatePresence` with a key, and it
 * drops out of sight as it leaves and rises back as it returns.
 */
export function NavBar({ action, count, selected, children }: { action?: ReactNode; count: number; selected: number; children: ReactNode }) {
    // Under reduced motion it only fades.
    const reduced = useReducedMotion() === true;

    // One pill behind every tab, slid to the one in view; the tabs share the width equally, so its place is the index alone.
    const slide = { '--nav-count': count, '--nav-index': Math.max(selected, 0) } as CSSProperties;

    return (
        <motion.div
            initial={reduced ? { opacity: 0 } : { transform: 'translateY(100%)', opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { transform: 'translateY(0%)', opacity: 1, transitionEnd: { transform: 'none' } }}
            exit={reduced ? { opacity: 0 } : { transform: ['translateY(0%)', 'translateY(100%)'], opacity: 0 }}
            transition={transition.sheet}
            className='flex shrink-0 items-center justify-center gap-3 px-4 pt-2 pb-[calc(0.75rem+var(--inset-bottom))]'
        >
            <div
                role='tablist'
                style={slide}
                className='relative flex h-14 max-w-sm min-w-0 flex-1 items-center rounded-full border border-line bg-base-2 p-1.5'
            >
                <div
                    className={cn(
                        'absolute inset-y-1.5 start-1.5 w-[calc((100%-0.75rem)/var(--nav-count))] rounded-full bg-btn-muted',
                        'translate-x-[calc(var(--nav-index)*100%)] rtl:translate-x-[calc(var(--nav-index)*-100%)]',
                        'transition-[translate,opacity] duration-(--duration-slide) ease-(--ease-slide)',
                        selected < 0 && 'opacity-0'
                    )}
                />

                {children}
            </div>

            {action}
        </motion.div>
    );
}

export function NavTab({ label, icon, selected, onSelect }: { label: string; icon: ReactNode; selected: boolean; onSelect: () => void }) {
    return <Button variant={selected ? 'navOn' : 'nav'} size='nav' role='tab' title={label} onClick={onSelect} icon={icon} />;
}

export function NavAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
    return <Button variant='chip' size='navAction' title={label} onClick={onClick} icon={icon} />;
}
