import type { ReactNode } from 'react';

import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy } from 'lucide-react';

import Live from './live';
import Button from './button';

import { T } from '../utility/language';
import { useClipboard } from '../hook/clipboard';

/**
 * Copy, with its result reported on the control itself.
 *
 * The result used to be an `Alert` underneath, which appeared between the buttons and the primary
 * action and pushed that action down — under the finger already reaching for it. Swapping the
 * glyph says the same thing where the user is already looking and moves no layout, and `Live`
 * carries it to assistive tech, which an Alert that mounts with its own text never did.
 */
export default function CopyButton({
    value,
    label,
    doneText = '',
    failedText = '',
    variant = 'bare',
    size = 'none',
    trailing = false,
    subtle = false,
    width,
    children
}: {
    value: string;
    label: string;
    doneText?: string;
    failedText?: string;
    variant?: 'bare' | 'muted' | 'normal' | 'primary';
    size?: 'none' | 'action';
    trailing?: boolean;
    /** The small muted form, set under a figure rather than beside it. */
    subtle?: boolean;
    width?: 'full';
    children?: ReactNode;
}) {
    const clipboard = useClipboard();

    const done = clipboard.state === 'done';

    const announced = () => {
        if (clipboard.state === 'idle') {
            return '';
        }

        if (clipboard.state === 'failed') {
            return failedText.length > 0 ? failedText : T('Dashboard.CopyFailed');
        }

        return doneText.length > 0 ? doneText : T('Dashboard.Copied');
    };

    const glyph = (
        <span className='relative flex size-5 shrink-0 items-center justify-center'>
            <AnimatePresence initial={false} mode='wait'>
                {done ? (
                    <motion.span
                        key='done'
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: [0.4, 1.35, 1], opacity: 1 }}
                        exit={{ scale: 0.4, opacity: 0 }}
                        transition={{ duration: 0.35 }}
                        className='absolute text-txt-normal'
                    >
                        <Check size={18} />
                    </motion.span>
                ) : (
                    <motion.span
                        key='copy'
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className='absolute'
                    >
                        <Copy size={18} />
                    </motion.span>
                )}
            </AnimatePresence>
        </span>
    );

    const bare = subtle ? 'inlineSubtle' : 'inlineRow';

    return (
        <Button
            // A filled variant is already a centred row; a bare one is laid out as a row here.
            variant={variant === 'bare' ? bare : variant}
            size={size}
            width={width}
            aria-label={children === undefined ? label : undefined}
            onClick={() => {
                void clipboard.copy(value);
            }}
        >
            <Live text={announced()} />

            {!trailing && glyph}

            {children}

            {trailing && glyph}
        </Button>
    );
}
