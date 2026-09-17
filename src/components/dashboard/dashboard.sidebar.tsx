import type { LucideIcon } from 'lucide-react';

import Logo from '../../assets/image/logo.png';

import Text from '../ui/text';
import Button from '../ui/button';
import MenuRow from '../ui/menu';

import { platform } from '../../platform';
import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { inset } from '../../layout/container';
import { useIsWindows } from '../../hook/platform';
import { Horizontal, Vertical } from '../ui/stack';

/* The product page, handed to the host browser rather than the wallet's own. It is a brand site,
   not a dApp — nothing on it wants a provider, and it has no business in a tab that carries one. */
const site = 'https://nurawallet.app';

export interface SidebarItem {
    key: string;
    label: string;
    icon: LucideIcon;
    active?: boolean;
    primary?: boolean;

    /** Marks the one action that erases the wallet, so the rail names it the same way the
        settings screen does rather than hiding it among the ordinary ones. */
    destructive?: boolean;
    onClick: () => void;
}

export default function DashboardSidebar({ items, actions, footer }: { items: SidebarItem[]; actions: SidebarItem[]; footer: SidebarItem[] }) {
    const isWindows = useIsWindows();

    return (
        <Vertical
            className={cn(
                'hidden w-60 shrink-0 gap-1 border-e border-line bg-base-2 p-3 pb-[calc(1.5rem+var(--inset-bottom))] lg:flex',
                inset.tabTop[isWindows ? 'windows' : 'device']
            )}
        >
            <Vertical className='items-center gap-2 px-3 py-5'>
                <Button
                    variant='bare'
                    title={site}
                    aria-label={T('App.Website')}
                    onClick={() => {
                        void platform.openUrl(site).catch(() => undefined);
                    }}
                    className='cursor-pointer rounded-surface'
                >
                    {/* Decorative: the button carries the name, and a labelled image inside a
                        labelled control is read out twice. */}
                    <img src={Logo} alt='' className='size-24' />
                </Button>

                <Text className='text-center' text={T('App.Tagline')} />
            </Vertical>

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

            <Horizontal className='gap-2 pb-1'>
                {actions.map((item) => (
                    <Button
                        key={item.key}
                        variant={item.destructive === true ? 'destructive' : 'normal'}
                        size='action'
                        onClick={item.onClick}
                        leftIcon={<item.icon size={16} className='shrink-0' />}
                        className='min-w-0 flex-1'
                    >
                        <span className='truncate'>{item.label}</span>
                    </Button>
                ))}
            </Horizontal>

            {footer.map((item) => (
                <MenuRow
                    key={item.key}
                    variant={item.primary === true ? 'primary' : 'muted'}
                    label={item.label}
                    leading={<item.icon size={18} className='shrink-0' />}
                    onClick={item.onClick}
                />
            ))}
        </Vertical>
    );
}
