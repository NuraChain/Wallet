import type { IconType } from 'react-icons';

import { motion } from 'motion/react';

import Text from '../ui/text';
import Button from '../ui/button';
import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { Vertical } from '../ui/stack';

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
            className={cn(
                'absolute inset-x-4 z-20 mx-auto flex w-fit max-w-full overflow-hidden rounded-full border border-line bg-base-2 shadow-float',
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
                        className='group flex h-14 min-w-24 shrink cursor-pointer items-center justify-center px-6 transition-colors duration-(--duration-fast)'
                    >
                        <Vertical
                            className={cn(
                                'items-center gap-1 transition-colors duration-(--duration-fast)',
                                isActive ? 'text-txt-accent' : 'text-txt-muted group-hover:text-txt-normal'
                            )}
                        >
                            <item.icon size={18} />

                            <Text variant='inherit' text={T(`Dashboard.Nav.${item.key}`)} />
                        </Vertical>
                    </Button>
                );
            })}
        </motion.div>
    );
}
