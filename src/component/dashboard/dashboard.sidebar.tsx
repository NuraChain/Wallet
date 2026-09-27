import { Logo } from '../../ui/media';

import Text from '../../ui/text';
import Button from '../../ui/button';
import MenuRow from '../../ui/menu';

import { platform } from '../../platform';
import { T } from '../../utility/language';
import { Horizontal, Vertical } from '../../ui/stack';
import type { SidebarItem } from '../../type/app';
import { SidebarPanel } from '../../ui/screen';
import { Block } from '../../ui/wrap';

/* The product page, handed to the host browser rather than the wallet's own. It is a brand site,
   not a dApp — nothing on it wants a provider, and it has no business in a tab that carries one. */
const site = 'https://nurawallet.app';

export default function DashboardSidebar({ items, actions, footer }: { items: SidebarItem[]; actions: SidebarItem[]; footer: SidebarItem[] }) {
    return (
        <SidebarPanel>
            <Vertical align='center' gap={2} px={3} py={5}>
                <Button
                    variant='logo'
                    title={site}
                    onClick={() => {
                        void platform.openUrl(site).catch(() => undefined);
                    }}
                    // Decorative: the button carries the name, and a labelled image inside a
                    // labelled control is read out twice.
                    icon={<Logo size={24} />}
                />

                <Text align='center' text={T('App.Tagline')} />
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

            <Block grow />

            <Horizontal gap={2} pb={1}>
                {actions.map((item) => (
                    <Button
                        key={item.key}
                        variant={item.destructive === true ? 'destructive' : 'normal'}
                        size='action'
                        onClick={item.onClick}
                        leftIcon={<item.icon size={16} className='shrink-0' />}
                        squeeze='x'
                        grow
                        label={item.label}
                    />
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
        </SidebarPanel>
    );
}
