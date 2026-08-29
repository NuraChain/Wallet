import type { IconType } from 'react-icons';

import { motion } from 'motion/react';

import Text from '../ui/text';
import Button from '../ui/button';
import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { Vertical } from '../ui/stack';

/**
 * DashboardNav - The grounded bottom navigation bar.
 *
 * Full width and seated on the bottom edge rather than floating: one hairline across the app's foot,
 * three equal targets, and an accent indicator on whichever is live. A floating pill read as a toy
 * next to the rest of this interface — it broke the frame's edges on wide windows and asked its own
 * corners to carry the identity. Grounded, the bar is furniture: predictable to find, impossible to
 * mistake for content, and the same width as everything else it serves.
 *
 * The active marker is a short accent rule seated on the bar's top edge, directly over the border it
 * interrupts, paired with the accent colour on the item itself. Colour never carries selection alone;
 * the rule does not move between tabs so there is no glide to follow — where you are is stated, not
 * performed.
 *
 * The bar still tucks away when the active panel scrolls (`hidden`), which is the one piece of its
 * old behaviour worth keeping: it exists to be reachable, not to be watched.
 * @param {object} props Component props.
 * @param {{ key: string; icon: IconType }[]} props.items The tabs, in order.
 * @param {number} props.active Index of the selected tab.
 * @param {boolean} props.hidden Whether the bar is tucked away.
 * @param {(index: number) => void} props.onSelect Activates a tab.
 * @returns {JSX.Element} The navigation bar.
 */
export default function DashboardNav({ items, active, hidden, onSelect }: { items: { key: string; icon: IconType }[]; active: number; hidden: boolean; onSelect: (index: number) => void })
{
    return (
        <motion.div
            role='tablist'
            animate={ { y: hidden ? '150%' : '0%', opacity: hidden ? 0 : 1 } }
            transition={ { type: 'tween', duration: 0.25 } }

            // `pb` holds the device inset — on a phone this is the home-indicator zone, and the bar
            // owes it clearance, not the page behind it. `pointer-events-none` while hidden so a
            // thumb landing where the bar was cannot press a control that is on its way out.
            className={
                cn(
                    'absolute inset-x-0 bottom-0 z-20 grid auto-cols-fr grid-flow-col border-t border-line bg-base-2',
                    'pb-[calc(0.375rem+env(safe-area-inset-bottom))]',
                    hidden && 'pointer-events-none'
                )
            }>

            {
                items.map((item, index) =>
                {
                    const isActive = index === active;

                    return (
                        <Button
                            role='tab'
                            key={ item.key }
                            id={ `dashboard-tab-${ item.key }` }
                            aria-selected={ isActive }
                            aria-controls={ `dashboard-panel-${ item.key }` }
                            onClick={ () => { onSelect(index); } }
                            className='group relative flex h-14 cursor-pointer items-center justify-center transition-colors duration-(--duration-fast)'>

                            {
                                isActive &&
                                (
                                    <span

                                        // Seated on the bar's top edge: the item begins exactly at
                                        // the border line, so the rule lands on it and reads as part
                                        // of the bar rather than as a decoration inside the tab.
                                        aria-hidden
                                        className='absolute top-0 h-0.5 w-8 rounded-full bg-btn-primary' />
                                )
                            }

                            <Vertical className={ cn('items-center gap-1 transition-colors duration-(--duration-fast)', isActive ? 'text-btn-primary' : 'text-txt-muted group-hover:text-txt-normal') }>

                                <item.icon size={ 18 } />

                                { /* `inherit` sets the size and no colour: the tab's own state
                                     decides what this reads as. */ }
                                <Text
                                    variant='inherit'
                                    text={ T(`Dashboard.Nav.${ item.key }`) } />

                            </Vertical>

                        </Button>
                    );
                })
            }

        </motion.div>
    );
}
