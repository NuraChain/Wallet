import type { ReactNode } from 'react';

import { FiAlertTriangle } from 'react-icons/fi';

import { cn } from '../../utility/cn';

/**
 * The three red-on-red treatments the app uses.
 *
 * `error` is the centred validation banner under a modal header; `warning` is the leading-triangle
 * block that fronts a destructive flow; `danger` is the same tint as running prose, used where the
 * text is a paragraph rather than a verdict.
 */
const variantMap =
{
    error: 'bg-txt-error/15 text-tiny rounded-lg px-3 py-2 text-center',
    warning: 'bg-txt-error/10 text-tiny flex items-start gap-2 rounded-xl px-3 py-2 text-start',
    danger: 'bg-txt-error/10 text-tiny rounded-lg px-3 py-2'
} as const;

/**
 * Alert - Inline error and warning surface.
 *
 * One component for every red box in the app, so the tint, radius and padding stop drifting between
 * copies. The `warning` variant brings its own triangle; the others are plain text containers.
 * @param {object} props Component props.
 * @param {'error' | 'warning' | 'danger'} [props.variant] Which treatment to render.
 * @param {string} [props.className] Extra classes; conflicting utilities override the variant's.
 * @param {ReactNode} props.children The message.
 * @returns {JSX.Element} The alert.
 */
export default function Alert({ variant = 'error', className = '', children }: { variant?: keyof typeof variantMap; className?: string; children: ReactNode })
{
    return (
        <div className={ cn('text-txt-error', variantMap[variant], className) }>

            {
                variant === 'warning' && <FiAlertTriangle size={ 16 } className='mt-0.5 shrink-0' />
            }

            {
                variant === 'warning' ?
                    (
                        <span>

                            { children }

                        </span>
                    ) :
                    children
            }

        </div>
    );
}
