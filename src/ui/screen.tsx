import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import Spinner from './spinner';

import { cn } from '../utility/cn';
import { inset } from './container';
import { surfacePanel } from './panel';
import { getDirection } from '../utility/language';
import { useIsWindows } from '../hook/platform';
import { blur, spring, transition } from './motion';

const useRise = () => ({
    initial: { opacity: 0, filter: blur.surface, transform: useReducedMotion() === true ? 'translateY(0px)' : 'translateY(16px)' },
    animate: {
        opacity: 1,
        filter: 'blur(0px)',
        transform: 'translateY(0px)',
        transition: { ...transition.reveal, transform: spring.entrance },
        transitionEnd: { filter: 'none', transform: 'none' }
    }
});

export function Screen({ enter, backdrop = false, children }: { enter: 'fade' | 'rise'; backdrop?: boolean; children: ReactNode }) {
    const rise = useRise();

    const motionProps = enter === 'fade' ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: transition.reveal } } : rise;

    return (
        <motion.div {...motionProps} className={cn('relative size-full', backdrop && 'bg-base-1')}>
            {children}
        </motion.div>
    );
}

export function EntryCard({ children }: { children: ReactNode }) {
    return (
        <motion.div {...useRise()} className={cn(surfacePanel, 'flex w-full max-w-md flex-col gap-4 rounded-dialog p-6')}>
            {children}
        </motion.div>
    );
}

export function Track({ index, children }: { index: number; children: ReactNode }) {
    return (
        <div
            className='flex size-full transition-transform duration-(--duration-slide) ease-(--ease-slide)'
            style={{ transform: `translateX(${getDirection() === 'rtl' ? index * 100 : index * -100}%)` }}
        >
            {children}
        </div>
    );
}

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

export function Splash() {
    return (
        <div className='flex size-full items-center justify-center bg-base-1'>
            <Spinner />
        </div>
    );
}

export function IntroBar({ children }: { children: ReactNode }) {
    return <div className='mt-3 flex shrink-0 items-center justify-between gap-2 sm:mt-4'>{children}</div>;
}

export function IntroSlide({ children }: { children: ReactNode }) {
    return <div className='flex h-full cursor-pointer flex-col items-center justify-center gap-2 px-2 pb-10'>{children}</div>;
}
