import type { ReactNode } from 'react';
import { motion } from 'motion/react';

import Spinner from './spinner';

import { cn } from '../utility/cn';
import { inset } from './container';
import { surfacePanel } from './panel';
import { getDirection } from '../utility/language';
import { useIsWindows } from '../hook/platform';

/** A route's own surface, arriving: the dashboard fades in; the intro grows from the centre. */
export function Screen({ enter, backdrop = false, children }: { enter: 'fade' | 'grow'; backdrop?: boolean; children: ReactNode }) {
    const motionProps = enter === 'fade' ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : { initial: { scale: 0 }, animate: { scale: 1 } };

    return (
        <motion.div {...motionProps} transition={{ type: 'tween' }} className={cn('relative size-full', backdrop && 'bg-base-1')}>
            {children}
        </motion.div>
    );
}

/** The single card a page is made of, fading in at the centre — the unlock screen. */
export function EntryCard({ children }: { children: ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'tween' }}
            className={cn(surfacePanel, 'flex w-full max-w-md flex-col gap-4 rounded-dialog p-6')}
        >
            {children}
        </motion.div>
    );
}

/** The dashboard's tabs side by side, slid so the one at `index` fills the view — mirrored for RTL. */
export function Track({ index, children }: { index: number; children: ReactNode }) {
    return (
        <div
            className='flex size-full transition-transform duration-(--duration-surface) ease-out'
            style={{ transform: `translateX(${getDirection() === 'rtl' ? index * 100 : index * -100}%)` }}
        >
            {children}
        </div>
    );
}

/** The dashboard's sidebar, which only exists from `lg`, padded clear of the title bar or the device's inset. */
export function SidebarPanel({ children }: { children: ReactNode }) {
    const isWindows = useIsWindows();

    return (
        <div
            className={cn(
                'flex flex-col',
                'hidden w-60 shrink-0 gap-1 border-e border-line bg-base-2 p-3 pb-[calc(1.5rem+var(--inset-bottom))] lg:flex',
                inset.tabTop[isWindows ? 'windows' : 'device']
            )}
        >
            {children}
        </div>
    );
}

/** The whole window waiting on a route, with nothing on it but a spinner. */
export function Splash() {
    return (
        <div className='flex size-full items-center justify-center bg-base-1'>
            <Spinner />
        </div>
    );
}

/** The intro's top bar: the language picker at one end, the theme toggle at the other. */
export function IntroBar({ children }: { children: ReactNode }) {
    return <div className='mt-3 flex shrink-0 items-center justify-between gap-2 sm:mt-4'>{children}</div>;
}

/** One slide of the intro carousel: its art, headline and line of copy, centred. */
export function IntroSlide({ children }: { children: ReactNode }) {
    return <div className='flex h-full cursor-pointer flex-col items-center justify-center gap-2 px-2 pb-10'>{children}</div>;
}
