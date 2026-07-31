import type { IconType } from 'react-icons';

import { motion } from 'motion/react';

import Button from '../ui/button';

import { inset } from '../../layout/container';
import { T } from '../../utility/language';

/**
 * DashboardNav - The floating pill navigation bar at the bottom of the dashboard.
 *
 * A glass capsule of tabs that rests just above the device inset and slides out of view when the
 * active panel scrolls (`hidden`). The active tab's filled background is a shared `layoutId`, so it
 * glides between tabs instead of blinking.
 *
 * Labels come from `Dashboard.Nav.<key>`, so a tab added to the map needs an entry in both language
 * bundles.
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
            className={ `glass-panel absolute inset-x-0 ${ inset.navBottom } z-20 mx-auto flex w-fit gap-1 rounded-full p-1 ${ hidden ? 'pointer-events-none' : '' }` }>

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
                            className={ `group relative flex h-12 w-20 cursor-pointer items-center justify-center rounded-full duration-300 ${ isActive ? '' : 'hover:bg-btn-muted-hover' }` }>

                            {
                                isActive &&
                                (
                                    <motion.div
                                        layoutId='dashboard-nav-active'
                                        transition={ { type: 'spring', stiffness: 420, damping: 35 } }
                                        className='absolute inset-0 rounded-full bg-btn-primary-active' />
                                )
                            }

                            <div className={ `relative flex flex-col items-center gap-1 duration-300 ${ isActive ? 'text-txt-reverse' : 'text-txt-muted group-hover:text-txt-normal' }` }>

                                <item.icon size={ 16 } />

                                <div className='text-tiny'>

                                    { T(`Dashboard.Nav.${ item.key }`) }

                                </div>

                            </div>

                        </Button>
                    );
                })
            }

        </motion.div>
    );
}
