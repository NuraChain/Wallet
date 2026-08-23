import type { HTMLAttributes, ReactNode } from 'react';

import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';

import { cn } from '../../utility/cn';

/**
 * What each outcome looks like.
 *
 * `error` is a verdict — a validation banner or a failed action. `warning` is the leading-triangle
 * block that fronts a destructive flow. `success` is the same shape as `error` in the other colour,
 * and it is the one that was missing: `--txt-success` existed in both themes, `Alert` had no way to
 * reach it, and so the copy-address and export-phrase surfaces rendered "done" and "that failed"
 * through the identical muted grey line. In a wallet those two must never look the same.
 *
 * The `danger` variant is gone. It was `error` minus the centring, and both of its three call sites
 * passed an alignment back in through `className` — one of them re-deriving `error` exactly. The
 * alignment is what varied, so alignment is what call sites pass.
 */
const variantMap =
{
    error: 'bg-txt-error/10 text-txt-error text-center',
    warning: 'bg-txt-error/10 text-txt-error flex items-start gap-2 text-start',
    success: 'bg-txt-success/10 text-txt-success flex items-start gap-2 text-start'
} as const;

/**
 * How much room the block takes.
 *
 * `compact` is the dialog default. `comfortable` is the intro's, where an alert is the only thing on
 * a wide sheet and the dialog metrics read as cramped — both intro screens were overriding the size
 * to `text-small` identically, which is a variant asking to exist.
 */
const sizeMap =
{
    compact: 'text-tiny rounded-control px-3 py-2',
    comfortable: 'text-small rounded-surface px-4 py-3'
} as const;

/**
 * Alert - Inline outcome surface.
 *
 * One component for every verdict box in the app, so the tint, radius and padding stop drifting
 * between copies. `warning` brings its own triangle and `success` its own tick; `error` is plain,
 * because an error is usually already announced by the thing that failed.
 *
 * An empty message renders nothing at all. Ten call sites each guarded their alert with the same
 * `message.length > 0 &&` conditional; the component knowing it has nothing to say removes all of
 * them, and `<Alert text={ error } />` reads as what it is.
 *
 * The role is not decoration. Seventeen of these render across the app and none of them were
 * announced, so a screen-reader user submitting an invalid form heard nothing happen at all. An
 * error asserts itself with `role='alert'`; a success is `polite`, because it is confirming
 * something the user already knows they did.
 *
 * An alert whose whole content is a message passes it as `text` and self-closes; `children` stays for
 * anything that composes. Both render in the same slot, so the two forms never combine.
 * @param {object} props Component props.
 * @param {'error' | 'warning' | 'success'} [props.variant] Which outcome to render.
 * @param {'compact' | 'comfortable'} [props.size] How much room the block takes.
 * @param {string} [props.text] The message, when that is all the alert holds.
 * @param {string} [props.className] Extra classes; conflicting utilities override the variant's.
 * @param {ReactNode} [props.children] Composed content, for the cases `text` cannot express.
 * @returns {JSX.Element | undefined} The alert, or nothing when there is no message.
 */
export default function Alert({ variant = 'error', size = 'compact', text, className = '', children, ...rest }: { variant?: keyof typeof variantMap; size?: keyof typeof sizeMap; text?: string; className?: string; children?: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>)
{
    const content = text ?? children;

    if (content === undefined || content === '')
    {
        return undefined;
    }

    const success = variant === 'success';

    return (
        <div
            role={ success ? 'status' : 'alert' }
            aria-live={ success ? 'polite' : 'assertive' }
            className={ cn(variantMap[variant], sizeMap[size], className) }
            { ...rest }>

            {
                variant === 'warning' && <FiAlertTriangle size={ 16 } className='mt-0.5 shrink-0' />
            }

            {
                success && <FiCheckCircle size={ 16 } className='mt-0.5 shrink-0' />
            }

            {
                variant === 'error' ?
                    content :
                    (
                        <span>

                            { content }

                        </span>
                    )
            }

        </div>
    );
}
