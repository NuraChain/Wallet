import { useRef, useState } from 'react';
import { Check, PenLine, Plus, Trash } from 'lucide-react';

import Text from '../../ui/text';
import Alert from '../../ui/alert';
import Button from '../../ui/button';
import { Tab, TabBar } from '../../ui/tabs';
import StatusBlock from '../../ui/state';
import SiteIcon from '../site.icon';
import SiteForm from '../site.form';
import ScrollBar from '../../ui/scrollbar';
import ConfirmDialog from '../../ui/confirm';
import DashboardBrowserTabs from './dashboard.browser.tabs';

import { T } from '../../utility/language';
import { getSiteHost } from '../../core/browser';
import { Horizontal, Vertical } from '../../ui/stack';
import type { BrowserFavorite, BrowserSection, BrowserState, BrowserTab, BrowserVisit } from '../../type/browser';
import { Block, Grid } from '../../ui/wrap';

function BrowserShortcut({ url, name, symbol, title, onPick }: { url: string; name: string; symbol?: string; title?: string; onPick: (url: string) => void }) {
    return (
        <Button
            title={title}
            variant='muted'
            onClick={() => {
                onPick(url);
            }}
            size='siteRow'
        >
            <SiteIcon url={url} symbol={symbol ?? name} />

            <Text variant='body' dir='ltr' squeeze='x' grow truncate text={name} />
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
function FavoriteCard({ item, grow = false, onPick }: { item: BrowserFavorite; grow?: boolean; onPick: (item: BrowserFavorite) => void }) {
    return (
        <Button
            dir='ltr'
            variant='chip'
            title={item.url}
            onClick={() => {
                onPick(item);
            }}
            size='siteCard'
            squeeze='x'
            grow={grow}
        >
            <SiteIcon primary url={item.url} symbol={item.name} size={9} />

            <Vertical squeeze='x' grow>
                <Text variant='body' truncate text={item.name} />

                <Text dir='ltr' truncate text={getSiteHost(item.url)} />
            </Vertical>
        </Button>
    );
}

export default function DashboardBrowserStart({
    section,
    favorites,
    tabs,
    active,
    states,
    visits,
    notice,
    onSection,
    onOpen,
    onPickTab,
    onCloseTab,
    onAddTab,
    onFavoriteSave,
    onFavoriteRemove
}: {
    /** Held by the browser, since closing the tab on show brings up another copy of this page. */
    section: BrowserSection;
    favorites: BrowserFavorite[];
    tabs: BrowserTab[];
    active: number;
    states: Map<number, BrowserState>;
    visits: BrowserVisit[];
    notice: string;
    onSection: (section: BrowserSection) => void;
    onOpen: (url: string) => void;
    onPickTab: (id: number) => void;
    onCloseTab: (id: number) => void;
    onAddTab: () => void;
    onFavoriteSave: (item: BrowserFavorite) => void;
    onFavoriteRemove: (id: string) => void;
}) {
    const viewportRef = useRef<HTMLDivElement>(null);

    const [editing, setEditing] = useState(false);

    const [editor, setEditor] = useState<BrowserFavorite | boolean>(false);
    const [removing, setRemoving] = useState<BrowserFavorite | undefined>(undefined);

    const tabMap: { key: BrowserSection; label: string }[] = [
        { key: 'favorite', label: T('Dashboard.Browser.Favorite') },
        { key: 'tabs', label: T('Dashboard.Browser.Tabs') },
        { key: 'history', label: T('Dashboard.Browser.Recent') }
    ];

    return (
        <Vertical relative fill='both'>
            <Vertical ref={viewportRef} fill='both' gap={3} scroll='y' p={4}>
                <TabBar>
                    {tabMap.map((item) => (
                        <Tab
                            key={item.key}
                            label={item.label}
                            selected={item.key === section}
                            onSelect={() => {
                                onSection(item.key);
                            }}
                        />
                    ))}

                    {/* A glyph alone, as the wallet's own tab bar ends: with three sections ahead of
                        it, the label ran past the edge of a phone in the longer languages. */}
                    {section === 'favorite' && (
                        <Button
                            title={editing ? T('Dashboard.Browser.FavoriteDone') : T('Dashboard.Browser.FavoriteManage')}
                            variant='muted'
                            size='icon'
                            onClick={() => {
                                setEditing(!editing);
                            }}
                            ms='auto'
                            shrink={false}
                            icon={editing ? <Check size={16} /> : <PenLine size={16} />}
                        />
                    )}
                </TabBar>

                <Block role='tabpanel'>
                    {section === 'favorite' &&
                        (editing ? (
                            <Vertical gap={2}>
                                {favorites.map((item) => (
                                    <Horizontal key={item.id} align='center' gap={2}>
                                        <FavoriteCard
                                            item={item}
                                            grow
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
                                            shrink={false}
                                            icon={<Trash size={16} />}
                                        />
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
                            <Grid look='favorites'>
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
                                    size='siteAdd'
                                >
                                    <Plus size={16} className='shrink-0' />

                                    <Text variant='inherit' squeeze='x' truncate text={T('Dashboard.Browser.FavoriteAdd')} />
                                </Button>
                            </Grid>
                        ))}

                    {section === 'tabs' && (
                        <DashboardBrowserTabs tabs={tabs} active={active} states={states} onPick={onPickTab} onClose={onCloseTab} onAdd={onAddTab} />
                    )}

                    {section === 'history' &&
                        (visits.length === 0 ? (
                            <StatusBlock panel text={T('Dashboard.Browser.RecentEmpty')} />
                        ) : (
                            <Grid look='recent'>
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
                            </Grid>
                        ))}
                </Block>

                {notice.length > 0 && (
                    <Vertical mt='auto' gap={1}>
                        <Text variant='caption' text={T('Dashboard.Browser.Hint')} />

                        <Alert dir='ltr' size='dense' textAlign='start' mono text={notice} />
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
