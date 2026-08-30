import type { IconType } from 'react-icons';

import Logo from '../../assets/image/logo.png';

import Text from '../ui/text';
import MenuRow from '../ui/menu';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { inset } from '../../layout/container';
import { useIsWindows } from '../../hook/platform';
import { Horizontal, Vertical } from '../ui/stack';

export interface SidebarItem {
    key: string;
    label: string;
    icon: IconType;
    active?: boolean;
    onClick: () => void;
}

export default function DashboardSidebar({ items, footer }: { items: SidebarItem[]; footer: SidebarItem }) {
    const isWindows = useIsWindows();

    return (
        <Vertical className={cn('hidden w-60 shrink-0 gap-1 border-e border-line bg-base-2 p-3 pb-6 lg:flex', inset.tabTop[isWindows ? 'windows' : 'device'])}>
            <Horizontal className='items-center gap-2 px-3 py-4'>
                <img src={Logo} alt='' className='size-6' />

                <Text variant='title' text={T('App.Name')} />
            </Horizontal>

            {items.map((item) => (
                <MenuRow
                    key={item.key}
                    selected={item.active === true}
                    label={item.label}
                    leading={<item.icon size={18} className='shrink-0' />}
                    onClick={item.onClick}
                />
            ))}

            <div className='flex-1' />

            <MenuRow label={footer.label} leading={<footer.icon size={18} className='shrink-0' />} onClick={footer.onClick} />
        </Vertical>
    );
}
