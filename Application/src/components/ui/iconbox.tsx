import type { ReactNode } from 'react';

import { cn } from '../../utility/cn';

/**
 * Fills the box can carry. `muted` is the neutral square in front of list rows; `primary` and
 * `secondary` are the branded discs used for letters, counters, and leading icons.
 */
const toneMap =
{
    muted: 'bg-btn-muted text-txt-normal',
    primary: 'bg-btn-primary text-txt-reverse',
    secondary: 'bg-btn-secondary text-txt-reverse'
} as const;

/**
 * IconBox - The small filled square that leads rows, chips, and headers.
 *
 * The same three-part recipe — fixed square, centred content, semantic fill — was written out by hand
 * in front of every list row and letter badge in the app. Size stays a class (`size-8`, `size-9`) so
 * call sites read like the Tailwind around them.
 * @param {object} props Component props.
 * @param {'muted' | 'primary' | 'secondary'} [props.tone] Which fill the box carries.
 * @param {string} [props.size] Sizing class for the square.
 * @param {string} [props.className] Extra classes; conflicting utilities override the defaults.
 * @param {ReactNode} props.children The icon, letter, or number inside the box.
 * @returns {JSX.Element} The box.
 */
export default function IconBox({ tone = 'muted', size = 'size-8', className = '', children }: { tone?: keyof typeof toneMap; size?: string; className?: string; children: ReactNode })
{
    return (
        <div className={ cn('flex shrink-0 items-center justify-center rounded-lg', toneMap[tone], size, className) }>

            { children }

        </div>
    );
}
