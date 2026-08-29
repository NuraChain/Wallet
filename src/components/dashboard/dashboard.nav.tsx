import type { IconType } from 'react-icons';

import { motion } from 'motion/react';

import Text from '../ui/text';
import Button from '../ui/button';
import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { Vertical } from '../ui/stack';

/**
 * DashboardNav - The floating bottom navigation bar.
 *
 * A stadium pill inset 16px from the left, right and bottom edges, lifted off the page on the one
 * shadow this interface allows anything that genuinely floats. Three equal targets, a hairline all
 * the way round rather than only across the top, and an accent indicator on whichever is live.
 *
 * The active marker is a short accent rule on the bar's top edge, paired with the accent colour on
 * the item itself. Colour never carries selection alone; the rule does not move between tabs so there
 * is no glide to follow — where you are is stated, not performed. It is clipped by the pill's own
 * radius, which is what `overflow-hidden` is doing here.
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
export default function DashboardNav({
    items,
    active,
    hidden,
    onSelect
}: {
    items: { key: string; icon: IconType }[];
    active: number;
    hidden: boolean;
    onSelect: (index: number) => void;
}) {
    return (
        <motion.div
            role='tablist'
            animate={{ y: hidden ? '150%' : '0%', opacity: hidden ? 0 : 1 }}
            transition={{ type: 'tween', duration: 0.25 }}

            // The bottom offset carries the device inset as well as the 16px float — on a phone that
            // inset is the home-indicator zone, and the bar owes it clearance, not the page behind
            // it. `pointer-events-none` while hidden so a thumb landing where the bar was cannot
            // press a control that is on its way out.
            className={cn(
                'absolute inset-x-4 z-20 grid auto-cols-fr grid-flow-col overflow-hidden rounded-full border border-line bg-base-2 shadow-float',
                'bottom-[calc(1rem+env(safe-area-inset-bottom))]',
                hidden && 'pointer-events-none'
            )}
        >
            {items.map((item, index) => {
                const isActive = index === active;

                return (
                    <Button
                        role='tab'
                        key={item.key}
                        id={`dashboard-tab-${item.key}`}
                        aria-selected={isActive}
                        aria-controls={`dashboard-panel-${item.key}`}
                        onClick={() => {
                            onSelect(index);
                        }}
                        className='group relative flex h-14 cursor-pointer items-center justify-center transition-colors duration-(--duration-fast)'
                    >
                        {isActive && (
                            <span
                                // On the bar's top edge rather than under the label, so it
                                // reads as part of the bar rather than as a decoration inside
                                // the tab. The outer two tabs sit well clear of the pill's
                                // curve, so a 32px rule lands on flat edge in all three.
                                aria-hidden
                                className='absolute top-0 h-0.5 w-8 rounded-full bg-btn-primary'
                            />
                        )}

                        <Vertical
                            className={cn(
                                'items-center gap-1 transition-colors duration-(--duration-fast)',
                                isActive ? 'text-btn-primary' : 'text-txt-muted group-hover:text-txt-normal'
                            )}
                        >
                            <item.icon size={18} />

                            {/* `inherit` sets the size and no colour: the tab's own state
                                     decides what this reads as. */}
                            <Text variant='inherit' text={T(`Dashboard.Nav.${item.key}`)} />
                        </Vertical>
                    </Button>
                );
            })}
        </motion.div>
    );
}
