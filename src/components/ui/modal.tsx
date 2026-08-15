import type { ReactNode } from 'react';

import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';

import Text from './text';
import Button from './button';

import { cn } from '../../utility/cn';
import { glassPanel } from './panel';
import { inset } from '../../layout/container';

/**
 * Modal - The app's one dialog shell: dimmed backdrop, centred glass panel, scale-in entrance.
 *
 * Eleven dialogs carried a private copy of this exact structure; the only things that ever differed
 * are captured as props. Exit animations still run because every dialog is mounted inside the page's
 * `AnimatePresence`, which fires the `exit` of the motion elements rendered here.
 *
 * `frame='screen'` swaps the shrink-wrapped centring for a padded full-screen frame (the history
 * overview), where the panel then sizes itself against the viewport instead of its content.
 *
 * `scroll` is the cap-and-scroll every long dialog wants; seven of them spelled the same two
 * utilities into `panelClass` by hand. It stays the panel's own overflow, which is the behaviour a
 * dialog should fall back to: wrapping the growing part in a `ModalBody` is what holds the header and
 * the footer still, and anything left outside that region can still scroll rather than being clipped.
 * @param {object} props Component props.
 * @param {() => void} props.onClose Called when the backdrop is clicked.
 * @param {string} [props.z] Stacking class for backdrop and frame, where a surface layers differently.
 * @param {'center' | 'screen'} [props.frame] Shrink-wrapped centring, or a padded full-screen frame.
 * @param {boolean} [props.scroll] Caps the panel against the viewport and scrolls its content.
 * @param {number} [props.scale] Entrance scale of the panel.
 * @param {string} [props.panelClass] Extra panel classes; conflicting utilities override the defaults.
 * @param {ReactNode} props.children The dialog content.
 * @returns {JSX.Element} The modal.
 */
export function Modal({ onClose, z = 'z-30', frame = 'center', scroll = false, scale = 0.9, panelClass = '', children }: { onClose: () => void; z?: string; frame?: 'center' | 'screen'; scroll?: boolean; scale?: number; panelClass?: string; children: ReactNode })
{
    return (
        <>
            { /*
              * No blur on the scrim, deliberately. Every other glass surface in the app blurs a
              * bounded box; this one covered the whole window *and* faded, so the compositor re-ran a
              * full-viewport backdrop filter on every frame of the animation — the one shape of blur
              * that reliably costs frames, and the worst of it on Android. The 25% dim in `bg-scrim`
              * was always what separated the dialog from the page; the 2px blur underneath it was
              * barely visible and was paying for the whole screen.
              */ }
            <motion.div
                initial={ { opacity: 0 } }
                animate={ { opacity: 1 } }
                exit={ { opacity: 0 } }
                className={ cn('absolute size-full cursor-pointer bg-scrim', z) }
                onClick={ onClose } />

            <div
                className={
                    cn(
                        frame === 'screen' ?
                            `absolute inset-0 flex items-center justify-center p-4 ${ inset.modalFrame }` :
                            'absolute inset-0 m-auto flex size-fit items-center justify-center',
                        z
                    )
                }>

                <motion.div
                    initial={ { opacity: 0, scale } }
                    animate={ { opacity: 1, scale: 1 } }
                    exit={ { opacity: 0, scale } }
                    className={ cn(glassPanel, 'flex w-80 flex-col gap-3 rounded-2xl p-4', scroll && 'max-h-[80vh] overflow-y-auto', panelClass) }>

                    { children }

                </motion.div>

            </div>
        </>
    );
}

/**
 * ModalHeader - Title row of a dialog: bold title, optional subtitle or leading box, close control.
 *
 * The close button is the standard muted square unless `close='chip'`, which renders the capsule
 * variant used where the dialog sits over busy content.
 * @param {object} props Component props.
 * @param {string} props.title The dialog title.
 * @param {string} [props.subtitle] Muted line under the title.
 * @param {ReactNode} [props.leading] Box rendered ahead of the title (an `IconBox`).
 * @param {'icon' | 'chip'} [props.close] Which close control to render.
 * @param {string} [props.closeLabel] Accessible label for the close control.
 * @param {string} [props.titleClass] Extra classes for the title text.
 * @param {string} [props.groupClass] Extra classes for the title group when subtitle or leading exist.
 * @param {string} [props.className] Extra classes for the row.
 * @param {() => void} props.onClose Closes the dialog.
 * @returns {JSX.Element} The header row.
 */
export function ModalHeader({ title, subtitle = '', leading, close = 'icon', closeLabel = '', titleClass = '', groupClass = '', className = '', onClose }: { title: string; subtitle?: string; leading?: ReactNode; close?: 'icon' | 'chip'; closeLabel?: string; titleClass?: string; groupClass?: string; className?: string; onClose: () => void })
{
    const heading = (
        <Text
            variant='title'
            className={ titleClass }
            text={ title } />
    );

    return (
        <div className={ cn('flex shrink-0 items-center justify-between', className) }>

            {
                subtitle.length === 0 && leading === undefined ?
                    heading :
                    (
                        <div className={ cn(leading === undefined ? 'flex flex-col' : 'flex min-w-0 items-center gap-2', groupClass) }>

                            { leading }

                            { heading }

                            {
                                subtitle.length > 0 && <Text text={ subtitle } />
                            }

                        </div>
                    )
            }

            <Button
                variant={ close === 'chip' ? 'chip' : 'muted' }
                size={ close === 'chip' ? 'iconChip' : 'icon' }
                aria-label={ closeLabel.length > 0 ? closeLabel : undefined }
                onClick={ onClose }
                className='shrink-0'>

                <IoClose size={ 20 } />

            </Button>

        </div>
    );
}

/**
 * ModalBody - The one part of a dialog that scrolls, so its header and actions do not.
 *
 * `min-h-0` is what makes it work: a flex item's automatic minimum is its content, so without it the
 * column refuses to shrink below the full list and the panel's cap is spent squeezing everything else
 * instead. `flex-1` then hands the leftover height to this region, which is why the header above it
 * and the actions below it keep the height they asked for.
 *
 * `*:shrink-0` is the same rule turned outward, and it belongs here rather than on every row: a row
 * that holds a fixed-height control (an `action` button is `h-11`) is itself a flex item, and the
 * algorithm squeezes it down to its text before it lets this region scroll. A row that forgot the
 * class did not fail loudly, it just lost its height — so the region states it once for all of them.
 *
 * The gap matches the panel's own, so rows sit the same distance apart whether they are inside this
 * region or not.
 *
 * The padding is 8px on every side, and the negative margin of the same size pays for it out of the
 * panel's own padding rather than out of the content, so the rows keep the width they have in a
 * dialog that does not scroll. It buys two things: the scrollbar stops sitting against the last
 * character, and a focused row can draw its outline. A scroll container clips at its padding box, and
 * `Button`'s focus ring is `outline-2 outline-offset-2` — 4px outside the row — so with no padding
 * the ring on the first row was cut off by the very region meant to hold it.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes; conflicting utilities override the defaults.
 * @param {ReactNode} props.children The scrolling content.
 * @returns {JSX.Element} The scroll region.
 */
export function ModalBody({ className = '', children }: { className?: string; children: ReactNode })
{
    return (
        <div className={ cn('-m-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-2 *:shrink-0', className) }>

            { children }

        </div>
    );
}

/**
 * ModalActions - The footer row of a dialog: side-by-side controls that split the width evenly.
 *
 * Six dialogs opened a `mt-1 flex gap-2` wrapper and then told each button inside it to be `flex-1`.
 * The row owning the split is what the row is for, so the buttons go back to describing only
 * themselves.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes; conflicting utilities override the defaults.
 * @param {ReactNode} props.children The controls, usually two buttons.
 * @returns {JSX.Element} The footer row.
 */
export function ModalActions({ className = '', children }: { className?: string; children: ReactNode })
{
    return (
        <div className={ cn('mt-1 flex shrink-0 gap-2 *:flex-1', className) }>

            { children }

        </div>
    );
}
