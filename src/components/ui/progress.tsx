import { motion } from 'motion/react';

import { cn } from '../../utility/cn';

export default function ProgressBar({ value, label = '', className = '' }: { value?: number; label?: string; className?: string }) {
    const determinate = value !== undefined;

    return (
        <div
            role='progressbar'
            aria-label={label.length > 0 ? label : undefined}
            aria-valuemin={determinate ? 0 : undefined}
            aria-valuemax={determinate ? 100 : undefined}
            aria-valuenow={determinate ? Math.round(value) : undefined}
            className={cn('relative h-0.5 overflow-hidden', className)}
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
