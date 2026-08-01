import type { HTMLAttributes, ReactNode } from 'react';

import { FiAlertTriangle } from 'react-icons/fi';

import { cn } from '../../utility/cn';

/**
 * The three red-on-red treatments the app uses.
 *
 * `error` is the centred validation banner under a modal header; `warning` is the leading-triangle
 * block that fronts a destructive flow; `danger` is running prose rather than a verdict. They share
 * one tint — the tenth that was written as `/15` on the error variant is the same idea at a different
 * strength, and one idea gets one value.
 */
const variantMap =
{
    error: 'bg-txt-error/10 text-tiny rounded-lg px-3 py-2 text-center',
    warning: 'bg-txt-error/10 text-tiny flex items-start gap-2 rounded-xl px-3 py-2 text-start',
    danger: 'bg-txt-error/10 text-tiny rounded-lg px-3 py-2'
} as const;

/**
 * Alert - Inline error and warning surface.
 *
 * One component for every red box in the app, so the tint, radius and padding stop drifting between
 * copies. The `warning` variant brings its own triangle; the others are plain text containers.
 *
 * An empty message renders nothing at all. Ten call sites each guarded their alert with the same
 * `message.length > 0 &&` conditional; the component knowing it has nothing to say removes all of
 * them, and `<Alert text={ error } />` reads as what it is.
 *
 * An alert whose whole content is a message passes it as `text` and self-closes; `children` stays for
 * anything that composes. Both render in the same slot, so the two forms never combine.
 * @param {object} props Component props.
 * @param {'error' | 'warning' | 'danger'} [props.variant] Which treatment to render.
 * @param {string} [props.text] The message, when that is all the alert holds.
 * @param {string} [props.className] Extra classes; conflicting utilities override the variant's.
 * @param {ReactNode} [props.children] Composed content, for the cases `text` cannot express.
 * @returns {JSX.Element | undefined} The alert, or nothing when there is no message.
 */
export default function Alert({ variant = 'error', text, className = '', children, ...rest }: { variant?: keyof typeof variantMap; text?: string; className?: string; children?: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>)
{
    const content = text ?? children;

    if (content === undefined || content === '')
    {
        return undefined;
    }

    return (
        <div className={ cn('text-txt-error', variantMap[variant], className) } { ...rest }>

            {
                variant === 'warning' && <FiAlertTriangle size={ 16 } className='mt-0.5 shrink-0' />
            }

            {
                variant === 'warning' ?
                    (
                        <span>

                            { content }

                        </span>
                    ) :
                    content
            }

        </div>
    );
}
