import { useState } from 'react';
import { motion } from 'motion/react';

import { cn } from '../utility/cn';
import { inkOn } from '../utility/color';
import { useTint } from '../hook/tint';

const inkMap = { dark: 'text-tint-dark', light: 'text-tint-light' } as const;

const toneMap = {
    accent: 'bg-txt-accent',
    ink: 'bg-current'
} as const;

const lookMap = {
    strip: 'size-full',
    track: 'w-32 rounded-full bg-base-3'
} as const;

export default function ProgressBar({ value, look, tone = 'accent' }: { value?: number; look?: keyof typeof lookMap; tone?: keyof typeof toneMap }) {
    const determinate = value !== undefined;

    return (
        <div role='progressbar' className={cn('relative h-0.5 overflow-hidden', look !== undefined && lookMap[look])}>
            {determinate ? (
                <div className={cn('absolute inset-y-0 inset-s-0 min-w-1.5', toneMap[tone])} style={{ width: `${value}%` }} />
            ) : (
                <motion.span
                    initial={{ transform: 'scaleX(0)' }}
                    animate={{ transform: 'scaleX(1)' }}
                    transition={{ duration: 1.1, ease: 'easeOut' }}
                    className={cn('absolute inset-0 origin-left rounded-full rtl:origin-right', toneMap[tone])}
                />
            )}
        </div>
    );
}

export function LoadStrip({ loading, progress, hidden = false }: { loading: boolean; progress: number; hidden?: boolean }) {
    const tint = useTint();

    const tinted = tint.length > 0;

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
        <div
            style={tinted ? { backgroundColor: tint } : undefined}
            className={cn(
                'relative h-0.5 shrink-0 overflow-hidden transition-[background-color] duration-(--duration-base)',
                tinted && inkMap[inkOn(tint)],
                hidden && 'hidden'
            )}
        >
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
                    <ProgressBar value={peak} look='strip' tone={tinted ? 'ink' : 'accent'} />
                </motion.div>
            )}
        </div>
    );
}
