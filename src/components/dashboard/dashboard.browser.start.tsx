import { useState } from 'react';
import { FiCheck, FiEdit3, FiPlus, FiTrash2 } from 'react-icons/fi';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import StatusBlock from '../ui/state';
import TokenIcon from '../token.icon';
import SectionHeader from '../ui/section';
import SiteForm from '../site.form';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { getSiteHost, getSiteIcon, type BrowserFavorite, type BrowserVisit } from '../../core/browser';
import { Horizontal, Vertical } from '../ui/stack';

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

export default function DashboardBrowserStart({
    explorer,
    favorites,
    visits,
    notice,
    onOpen,
    onFavoriteSave,
    onFavoriteRemove
}: {
    explorer?: { name: string; url: string };
    favorites: BrowserFavorite[];
    visits: BrowserVisit[];
    notice: string;
    onOpen: (url: string) => void;
    onFavoriteSave: (item: BrowserFavorite) => void;
    onFavoriteRemove: (id: string) => void;
}) {
    const [editing, setEditing] = useState(false);

    const [editor, setEditor] = useState<BrowserFavorite | boolean>(false);

    return (
        <Vertical className='size-full gap-3 overflow-y-auto p-4'>
            <SectionHeader title={T('Dashboard.Browser.Favorite')}>
                <Button
                    variant='muted'
                    size='small'
                    onClick={() => {
                        setEditing(!editing);
                    }}
                    leftIcon={editing ? <FiCheck size={14} /> : <FiEdit3 size={14} />}
                    text={editing ? T('Dashboard.Browser.FavoriteDone') : T('Dashboard.Browser.FavoriteManage')}
                />
            </SectionHeader>

            {favorites.length === 0 && explorer === undefined && !editing ? (
                <StatusBlock panel text={T('Dashboard.Browser.FavoriteEmpty')} />
            ) : (
                <div className={cn(editing ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2')}>
                    {explorer !== undefined && !editing && <BrowserShortcut primary url={explorer.url} name={explorer.name} onPick={onOpen} />}

                    {favorites.map((item) =>
                        editing ? (
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
                        ) : (
                            <BrowserShortcut primary key={item.id} url={item.url} name={item.name} title={item.url} onPick={onOpen} />
                        )
                    )}

                    {editing && (
                        <Button
                            variant='normal'
                            size='action'
                            onClick={() => {
                                setEditor(true);
                            }}
                            leftIcon={<FiPlus size={16} />}
                            text={T('Dashboard.Browser.FavoriteAdd')}
                        />
                    )}
                </div>
            )}

            <SectionHeader title={T('Dashboard.Browser.Recent')} />

            {visits.length === 0 ? (
                <StatusBlock panel text={T('Dashboard.Browser.RecentEmpty')} />
            ) : (
                <div className='grid grid-cols-2 gap-2'>
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
            )}

            {notice.length > 0 && (
                <Vertical className='mt-auto gap-1'>
                    <Text variant='caption' text={T('Dashboard.Browser.Hint')} />

                    <Alert dir='ltr' className='px-2 py-1 text-start font-mono' text={notice} />
                </Vertical>
            )}

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
