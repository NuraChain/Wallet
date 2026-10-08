import { useState } from 'react';
import { motion } from 'motion/react';

import { cn } from '../utility/cn';

const lookMap = {
    /** Fills the strip it sits in, under the address bar. */
    strip: 'size-full',
    /** A short rounded track standing on its own, under a loading message. */
    track: 'w-32 rounded-full bg-base-3'
} as const;

/**
 * With no `value` there is no progress to report, so the bar fills once and stays full for as long
 * as the wait goes on. It used to slide across and start over, which read as the load itself
 * starting over each time it reached the end.
 *
 * It is scaled rather than widened, so nothing reflows while it runs, and from the side reading
 * starts on: a transform has no logical direction of its own, so the origin is what flips.
 */
export default function ProgressBar({ value, look }: { value?: number; look?: keyof typeof lookMap }) {
    const determinate = value !== undefined;

    return (
        <div role='progressbar' className={cn('relative h-0.5 overflow-hidden', look !== undefined && lookMap[look])}>
            {determinate ? (
                <div className='absolute inset-y-0 inset-s-0 min-w-1.5 bg-txt-accent' style={{ width: `${value}%` }} />
            ) : (
                <motion.span
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 1.1, ease: 'easeOut' }}
                    className='absolute inset-0 origin-left rounded-full bg-txt-accent rtl:origin-right'
                />
            )}
        </div>
    );
}

/**
 * The strip under the browser's address bar: a page's load, fading out once it is done.
 *
 * A page reports its load in fits and starts. Progress can fall back, the load can be called done
 * before the last of it has arrived, and a redirect ends one load only to begin the next from
 * nothing — and a bar that followed all of that filled, vanished and started over. So it only ever
 * moves forward; a finished load stands full for a moment before it fades; and a load that begins
 * while that bar is still up is the same one going on, which leaves it full until that ends too.
 */
export function LoadStrip({ loading, progress, hidden = false }: { loading: boolean; progress: number; hidden?: boolean }) {
    const [shown, setShown] = useState(loading);
    const [peak, setPeak] = useState(loading ? progress : 0);

    if (loading && !shown) {
        setShown(true);
        setPeak(progress);
    } else if (loading && progress > peak) {
        setPeak(progress);
    } else if (!loading && shown && peak !== 100) {
        setPeak(100);
    }

    return (
        <div className={cn('relative h-0.5 shrink-0 overflow-hidden', hidden && 'hidden')}>
            {shown && (
                <motion.div
                    initial={false}
                    animate={{ opacity: loading ? 1 : 0 }}
                    transition={loading ? { duration: 0 } : { duration: 0.25, delay: 0.3 }}
                    onAnimationComplete={() => {
                        if (!loading) {
                            setShown(false);
                        }
                    }}
                    className='absolute inset-0'
                >
                    <ProgressBar value={peak} look='strip' />
                </motion.div>
            )}
        </div>
    );
}
