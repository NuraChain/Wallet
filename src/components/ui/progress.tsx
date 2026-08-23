import { motion } from 'motion/react';

import { cn } from '../../utility/cn';

/**
 * ProgressBar - A load in progress, whether or not its extent is known.
 *
 * Two of these existed about sixty lines apart in the same render tree — one reading real percentages
 * off the WebView, one sweeping while the frame was still coming up — and they agreed on `h-0.5` and
 * `bg-btn-primary` only by coincidence of authorship. They also had no role between them, so a load
 * was silent to a screen reader in both shapes.
 *
 * `value` decides which one this is. A number is a determinate bar and fills to that percentage; a
 * bar with no value sweeps, which is the honest answer when the frame has not reported anything yet.
 *
 * `min-w-1.5` on the determinate fill is what stops a load that has only just started from rendering
 * as a bar that is not there: a browser reports 0% for the first frames, and a zero-width bar and no
 * bar at all look identical while being very different claims.
 *
 * The sweep is pinned to the start edge and travels by a percentage of its own width, so it mirrors
 * with the writing direction. It used to animate `x`, which compiles to a physical `translateX`, and
 * with no inset declared the parked keyframe left it sitting in the left-hand half of the track in
 * Persian and Arabic.
 * @param {object} props Component props.
 * @param {number} [props.value] Completion from 0 to 100; omitted for an indeterminate sweep.
 * @param {string} [props.label] Accessible name for the bar.
 * @param {string} [props.className] Extra classes for the track.
 * @returns {JSX.Element} The bar.
 */
export default function ProgressBar({ value, label = '', className = '' }: { value?: number; label?: string; className?: string })
{
    const determinate = value !== undefined;

    return (
        <div
            role='progressbar'
            aria-label={ label.length > 0 ? label : undefined }
            aria-valuemin={ determinate ? 0 : undefined }
            aria-valuemax={ determinate ? 100 : undefined }
            aria-valuenow={ determinate ? Math.round(value) : undefined }
            className={ cn('relative h-0.5 overflow-hidden', className) }>

            {
                determinate ?
                    (
                        <div
                            className='absolute inset-y-0 inset-s-0 min-w-1.5 bg-btn-primary'
                            style={ { width: `${ value }%` } } />
                    ) :
                    (
                        <motion.span
                            animate={ { insetInlineStart: [ '-50%', '100%' ] } }
                            transition={ { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } }
                            className='absolute inset-y-0 inset-s-0 w-1/2 rounded-full bg-btn-primary' />
                    )
            }

        </div>
    );
}
