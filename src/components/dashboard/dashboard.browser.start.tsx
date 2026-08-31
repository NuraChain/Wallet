import { useRef, useState } from 'react';
import { FiCheck, FiEdit3, FiPlus, FiTrash2 } from 'react-icons/fi';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import StatusBlock from '../ui/state';
import TokenIcon from '../token.icon';
import SiteForm from '../site.form';
import ScrollBar from '../ui/scrollbar';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { getSiteHost, getSiteIcon, type BrowserFavorite, type BrowserVisit } from '../../core/browser';
import { Horizontal, Vertical } from '../ui/stack';

type TabKey = 'favorite' | 'history';

function BrowserShortcut({
    url,
    name,
    symbol,
    title,
    ltr = false,
    primary = false,
    className = '',
    onPick
}: {
    url: string;
    name: string;
    symbol?: string;
    title?: string;
    ltr?: boolean;
    primary?: boolean;
    className?: string;
    onPick: (url: string) => void;
}) {
    return (
        <Button
            title={title}
            variant='muted'
            onClick={() => {
                onPick(url);
            }}
            className={cn('h-12 gap-2.5 rounded-surface px-2.5 text-start', className)}
        >
            <TokenIcon kind='unknown' src={getSiteIcon(url)} symbol={symbol ?? name} primary={primary} className='size-8 text-tiny' />

            <Text variant='body' dir={ltr ? 'ltr' : undefined} className='flex-1 truncate' text={name} />
        </Button>
    );
}

function BrowserCard({ item, onPick }: { item: BrowserFavorite; onPick: (url: string) => void }) {
    return (
        <Button
            title={item.url}
            variant='muted'
            onClick={() => {
                onPick(item.url);
            }}
            className='flex-col items-center gap-2 rounded-surface p-4'
        >
            <TokenIcon primary kind='unknown' src={getSiteIcon(item.url)} symbol={item.name} className='size-12 text-small' />

            <Vertical className='w-full min-w-0 items-center'>
                <Text variant='body' className='w-full truncate text-center' text={item.name} />

                <Text dir='ltr' className='w-full truncate text-center font-mono' text={getSiteHost(item.url)} />
            </Vertical>
        </Button>
    );
}

export default function DashboardBrowserStart({
    favorites,
    visits,
    notice,
    onOpen,
    onFavoriteSave,
    onFavoriteRemove
}: {
    favorites: BrowserFavorite[];
    visits: BrowserVisit[];
    notice: string;
    onOpen: (url: string) => void;
    onFavoriteSave: (item: BrowserFavorite) => void;
    onFavoriteRemove: (id: string) => void;
}) {
    const viewportRef = useRef<HTMLDivElement>(null);

    const [tab, setTab] = useState<TabKey>('favorite');
    const [editing, setEditing] = useState(false);

    const [editor, setEditor] = useState<BrowserFavorite | boolean>(false);

    const tabMap: { key: TabKey; label: string }[] = [
        { key: 'favorite', label: T('Dashboard.Browser.Favorite') },
        { key: 'history', label: T('Dashboard.Browser.Recent') }
    ];

    return (
        <Vertical className='relative size-full'>
            <Vertical ref={viewportRef} className='size-full gap-3 overflow-y-auto p-4'>
                <Horizontal role='tablist' className='items-center border-b border-line'>
                    {tabMap.map((item) => (
                        <Button
                            key={item.key}
                            role='tab'
                            id={`browser-tab-${item.key}`}
                            aria-selected={item.key === tab}
                            aria-controls={`browser-panel-${item.key}`}
                            onClick={() => {
                                setTab(item.key);
                            }}
                            className={cn(
                                'relative h-10 cursor-pointer px-3 text-small font-medium transition-colors duration-(--duration-fast)',
                                item.key === tab ? 'text-txt-accent' : 'text-txt-muted hover:text-txt-normal'
                            )}
                        >
                            {item.label}

                            {item.key === tab && <span aria-hidden className='absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-txt-accent' />}
                        </Button>
                    ))}

                    {tab === 'favorite' && (
                        <Button
                            variant='muted'
                            size='small'
                            onClick={() => {
                                setEditing(!editing);
                            }}
                            leftIcon={editing ? <FiCheck size={14} /> : <FiEdit3 size={14} />}
                            text={editing ? T('Dashboard.Browser.FavoriteDone') : T('Dashboard.Browser.FavoriteManage')}
                            className='ms-auto mb-1 shrink-0'
                        />
                    )}
                </Horizontal>

                <div role='tabpanel' id={`browser-panel-${tab}`} aria-labelledby={`browser-tab-${tab}`}>
                    {tab === 'favorite' &&
                        (editing ? (
                            <Vertical className='gap-2'>
                                {favorites.map((item) => (
                                    <Horizontal key={item.id} className='items-center gap-2'>
                                        <BrowserShortcut
                                            primary
                                            url={item.url}
                                            name={item.name}
                                            title={item.url}
                                            className='min-w-0 flex-1'
                                            onPick={() => {
                                                setEditor(item);
                                            }}
                                        />

                                        <Button
                                            variant='danger'
                                            size='icon'
                                            onClick={() => {
                                                onFavoriteRemove(item.id);
                                            }}
                                            aria-label={T('Dashboard.Browser.FavoriteRemove')}
                                            className='shrink-0'
                                        >
                                            <FiTrash2 size={16} />
                                        </Button>
                                    </Horizontal>
                                ))}

                                <Button
                                    variant='normal'
                                    size='action'
                                    onClick={() => {
                                        setEditor(true);
                                    }}
                                    leftIcon={<FiPlus size={16} />}
                                    text={T('Dashboard.Browser.FavoriteAdd')}
                                />
                            </Vertical>
                        ) : (
                            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
                                {favorites.map((item) => (
                                    <BrowserCard key={item.id} item={item} onPick={onOpen} />
                                ))}

                                <Button
                                    variant='normal'
                                    onClick={() => {
                                        setEditor(true);
                                    }}
                                    aria-label={T('Dashboard.Browser.FavoriteAdd')}
                                    className='min-h-28 flex-col items-center justify-center gap-2 rounded-surface border-dashed p-4 text-txt-muted hover:text-txt-normal'
                                >
                                    <FiPlus size={20} className='shrink-0' />

                                    <Text variant='inherit' className='w-full truncate text-center' text={T('Dashboard.Browser.FavoriteAdd')} />
                                </Button>
                            </div>
                        ))}

                    {tab === 'history' &&
                        (visits.length === 0 ? (
                            <StatusBlock panel text={T('Dashboard.Browser.RecentEmpty')} />
                        ) : (
                            <div className='grid grid-cols-2 gap-2 lg:grid-cols-4'>
                                {visits.map((item) => (
                                    <BrowserShortcut
                                        ltr
                                        key={item.url}
                                        url={item.url}
                                        name={getSiteHost(item.url)}
                                        symbol={getSiteHost(item.url).toUpperCase()}
                                        title={item.url}
                                        onPick={onOpen}
                                    />
                                ))}
                            </div>
                        ))}
                </div>

                {notice.length > 0 && (
                    <Vertical className='mt-auto gap-1'>
                        <Text variant='caption' text={T('Dashboard.Browser.Hint')} />

                        <Alert dir='ltr' className='px-2 py-1 text-start font-mono' text={notice} />
                    </Vertical>
                )}
            </Vertical>

            <ScrollBar viewportRef={viewportRef} />

            {editor !== false && (
                <SiteForm
                    item={editor === true ? undefined : editor}
                    title={editor === true ? T('Dashboard.Browser.FavoriteAdd') : T('Dashboard.Browser.FavoriteEdit')}
                    onSave={(item) => {
                        onFavoriteSave(item);
                        setEditor(false);
                    }}
                    onClose={() => {
                        setEditor(false);
                    }}
                />
            )}
        </Vertical>
    );
}
