import { AnimatePresence, motion } from 'motion/react';

import { cn } from '../utility/cn';

const lookMap = {
    /** Fills the strip it sits in, under the address bar. */
    strip: 'size-full',
    /** A short rounded track standing on its own, under a loading message. */
    track: 'w-32 rounded-full bg-base-3'
} as const;

export default function ProgressBar({ value, label = '', look }: { value?: number; label?: string; look?: keyof typeof lookMap }) {
    const determinate = value !== undefined;

    return (
        <div
            role='progressbar'
            aria-label={label.length > 0 ? label : undefined}
            aria-valuemin={determinate ? 0 : undefined}
            aria-valuemax={determinate ? 100 : undefined}
            aria-valuenow={determinate ? Math.round(value) : undefined}
            className={cn('relative h-0.5 overflow-hidden', look !== undefined && lookMap[look])}
        >
            {determinate ? (
                <div className='absolute inset-y-0 inset-s-0 min-w-1.5 bg-txt-accent' style={{ width: `${value}%` }} />
            ) : (
                <motion.span
                    animate={{ insetInlineStart: ['-50%', '100%'] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                    className='absolute inset-y-0 inset-s-0 w-1/2 rounded-full bg-txt-accent'
                />
            )}
        </div>
    );
}

/** The strip under the browser's address bar: a page's load, fading out once it is done. */
export function LoadStrip({ loading, progress, label, hidden = false }: { loading: boolean; progress: number; label: string; hidden?: boolean }) {
    return (
        <div className={cn('relative h-0.5 shrink-0 overflow-hidden', hidden && 'hidden')}>
            <AnimatePresence>
                {loading && (
                    <motion.div key='progress' initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className='absolute inset-0'>
                        <ProgressBar value={progress} label={label} look='strip' />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
