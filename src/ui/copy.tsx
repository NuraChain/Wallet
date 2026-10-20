import type { ReactNode } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Copy } from 'lucide-react';

import Live from './live';
import Button from './button';

import { T } from '../utility/language';
import { useClipboard } from '../hook/clipboard';
import { blur, scale, transition } from './motion';

export default function CopyButton({
    value,
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
    doneText?: string;
    failedText?: string;
    variant?: 'bare' | 'muted' | 'normal' | 'primary';
    size?: 'none' | 'action';
    trailing?: boolean;
    subtle?: boolean;
    width?: 'full';
    children?: ReactNode;
}) {
    const clipboard = useClipboard();

    const done = clipboard.state === 'done';

    const reduced = useReducedMotion() === true;
    const away = { opacity: 0, filter: blur.icon, transform: `scale(${reduced ? 1 : scale.icon})` };
    const shown = { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)', transition: transition.swap };

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
            <AnimatePresence initial={false}>
                <motion.span
                    key={done ? 'done' : 'copy'}
                    initial={away}
                    animate={shown}
                    exit={{ ...away, transition: transition.swap }}
                    className={done ? 'absolute text-txt-normal' : 'absolute'}
                >
                    {done ? <Check size={18} /> : <Copy size={18} />}
                </motion.span>
            </AnimatePresence>
        </span>
    );

    const bare = subtle ? 'inlineSubtle' : 'inlineRow';

    return (
        <Button
            variant={variant === 'bare' ? bare : variant}
            size={size}
            width={width}
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
