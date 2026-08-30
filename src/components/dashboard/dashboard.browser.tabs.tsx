import { IoClose } from 'react-icons/io5';
import { FiPlus } from 'react-icons/fi';
import { useEffect, useRef } from 'react';

import Text from '../ui/text';
import Button from '../ui/button';

import { selectedTint } from '../ui/menu';
import TokenIcon from '../token.icon';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { getSiteHost, getSiteIcon, type BrowserTab } from '../../core/browser';
import { Horizontal } from '../ui/stack';

const chipBase =
    'flex h-9 w-30 grow items-center gap-1 rounded-surface border ps-3 pe-1 transition-[background-color,border-color] duration-(--duration-fast) ease-initial';
const chipIdle = 'border-line bg-base-3 hover:bg-base-2';
const chipLive = selectedTint;

export default function DashboardBrowserTabs({
    tabs,
    active,
    onPick,
    onClose,
    onAdd
}: {
    tabs: BrowserTab[];
    active: number;
    onPick: (id: number) => void;
    onClose: (id: number) => void;
    onAdd: () => void;
}) {
    const stripRef = useRef<HTMLDivElement>(null);

    const at = tabs.findIndex((item) => item.id === active);

    const listed = tabs.some((item) => item.index >= 0);

    useEffect(() => {
        if (at === -1) {
            return;
        }

        stripRef.current?.children[at]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [at, tabs.length]);

    if (!listed) {
        return undefined;
    }

    return (
        <Horizontal className='shrink-0 items-center gap-1.5 border-b border-line bg-base-1 p-2'>
            <Button variant='chip' size='iconChip' aria-label={T('Dashboard.Browser.TabNew')} onClick={onAdd} className='size-8 shrink-0'>
                <FiPlus size={16} />
            </Button>

            <div className='min-w-0 flex-1'>
                <Horizontal ref={stripRef} className='w-full [scrollbar-width:none] gap-2 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden'>
                    {tabs.map((item) => {
                        const url = item.index < 0 ? '' : item.entries[item.index];

                        const name = url.length > 0 ? getSiteHost(url) : T('Dashboard.Browser.TabEmpty');

                        return (
                            <div key={item.id} className={cn(chipBase, item.id === active ? chipLive : chipIdle)}>
                                <Button
                                    aria-current={item.id === active}
                                    title={url.length > 0 ? url : name}
                                    onClick={() => {
                                        onPick(item.id);
                                    }}
                                    className='flex min-w-0 flex-1 cursor-pointer items-center gap-1.5'
                                >
                                    {url.length > 0 && (
                                        <TokenIcon kind='unknown' src={getSiteIcon(url)} symbol={name.toUpperCase()} className='size-5 text-tiny' />
                                    )}

                                    <Text
                                        variant={item.id === active ? 'captionStrong' : 'caption'}
                                        dir='ltr'
                                        className='min-w-0 flex-1 truncate text-start'
                                        text={name}
                                    />
                                </Button>

                                <Button
                                    aria-label={T('Dashboard.Browser.TabClose')}
                                    onClick={() => {
                                        onClose(item.id);
                                    }}
                                    className='flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-txt-muted hover:bg-base-2'
                                >
                                    <IoClose size={14} />
                                </Button>
                            </div>
                        );
                    })}
                </Horizontal>
            </div>
        </Horizontal>
    );
}
