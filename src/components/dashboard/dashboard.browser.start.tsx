import { useRef, useState } from 'react';
import { Check, PenLine, Plus, Trash } from 'lucide-react';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import StatusBlock from '../ui/state';
import SiteIcon from '../site.icon';
import SiteForm from '../site.form';
import ScrollBar from '../ui/scrollbar';
import ConfirmDialog from '../ui/confirm';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { getSiteHost, type BrowserFavorite, type BrowserVisit } from '../../core/browser';
import { Horizontal, Vertical } from '../ui/stack';

type TabKey = 'favorite' | 'history';

function BrowserShortcut({ url, name, symbol, title, onPick }: { url: string; name: string; symbol?: string; title?: string; onPick: (url: string) => void }) {
    return (
        <Button
            title={title}
            variant='muted'
            onClick={() => {
                onPick(url);
            }}
            className='h-12 gap-2.5 rounded-surface px-2.5 text-start'
        >
            <SiteIcon url={url} symbol={symbol ?? name} />

            <Text variant='body' dir='ltr' className='min-w-0 flex-1 truncate' text={name} />
        </Button>
    );
}

/**
 * A favourite as a card: what it is, and where it actually goes.
 *
 * The card lays out LTR in every language. A favicon beside a domain is an inherently LTR pair,
 * and the host line is forced LTR already — mirroring the row put the icon on one side and the
 * address it belongs to on the other.
 *
 * The host is the description because it is the one fact about a bookmark worth checking before
 * tapping it — the name is whatever the user typed, and this is the browser a site signs through.
 */
function FavoriteCard({ item, className = '', onPick }: { item: BrowserFavorite; className?: string; onPick: (item: BrowserFavorite) => void }) {
    return (
        <Button
            dir='ltr'
            variant='chip'
            title={item.url}
            onClick={() => {
                onPick(item);
            }}
            className={cn('h-16 min-w-0 justify-start gap-2.5 rounded-surface px-3 text-start', className)}
        >
            <SiteIcon primary url={item.url} symbol={item.name} className='size-9 text-tiny' />

            <Vertical className='min-w-0 flex-1'>
                <Text variant='body' className='truncate' text={item.name} />

                <Text dir='ltr' className='truncate' text={getSiteHost(item.url)} />
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
    const [removing, setRemoving] = useState<BrowserFavorite | undefined>(undefined);

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
                            leftIcon={editing ? <Check size={14} /> : <PenLine size={14} />}
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
                                        <FavoriteCard
                                            item={item}
                                            className='flex-1'
                                            onPick={() => {
                                                setEditor(item);
                                            }}
                                        />

                                        <Button
                                            variant='danger'
                                            size='icon'
                                            onClick={() => {
                                                setRemoving(item);
                                            }}
                                            aria-label={T('Dashboard.Browser.FavoriteRemove')}
                                            className='shrink-0'
                                        >
                                            <Trash size={16} />
                                        </Button>
                                    </Horizontal>
                                ))}

                                <Button
                                    variant='normal'
                                    size='action'
                                    onClick={() => {
                                        setEditor(true);
                                    }}
                                    leftIcon={<Plus size={16} />}
                                    text={T('Dashboard.Browser.FavoriteAdd')}
                                />
                            </Vertical>
                        ) : (
                            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'>
                                {favorites.map((item) => (
                                    <FavoriteCard
                                        key={item.id}
                                        item={item}
                                        onPick={(picked) => {
                                            onOpen(picked.url);
                                        }}
                                    />
                                ))}

                                <Button
                                    variant='normal'
                                    onClick={() => {
                                        setEditor(true);
                                    }}
                                    aria-label={T('Dashboard.Browser.FavoriteAdd')}
                                    className='h-16 items-center justify-center gap-2 rounded-surface border-dashed px-3 text-txt-muted hover:text-txt-normal'
                                >
                                    <Plus size={16} className='shrink-0' />

                                    <Text variant='inherit' className='min-w-0 truncate' text={T('Dashboard.Browser.FavoriteAdd')} />
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

            {removing !== undefined && (
                <ConfirmDialog
                    title={T('Dashboard.Browser.FavoriteRemove')}
                    message={T('Dashboard.Browser.FavoriteRemoveConfirm', removing.name)}
                    onCancel={() => {
                        setRemoving(undefined);
                    }}
                    onConfirm={() => {
                        onFavoriteRemove(removing.id);
                        setRemoving(undefined);
                    }}
                />
            )}
        </Vertical>
    );
}
