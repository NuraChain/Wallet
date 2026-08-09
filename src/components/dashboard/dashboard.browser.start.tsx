import { useState } from 'react';
import { FiCheck, FiEdit3, FiPlus, FiTrash2 } from 'react-icons/fi';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import EmptyState from '../ui/state';
import TokenIcon from '../token.icon';
import SectionHeader from '../ui/section';
import DashboardBrowserFavorite from './dashboard.browser.favorite';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { getSiteHost, getSiteIcon, type BrowserFavorite, type BrowserVisit } from '../../core/browser';
import { Horizontal, Vertical } from '../ui/stack';

/**
 * BrowserShortcut - One tile in a start-screen grid: a site's own icon and what to call it.
 *
 * All three lists here are the same tile — a curated address, a favourite, a page opened before — so
 * they are one component rather than three copies of it, and a change to the shape they share is made
 * once.
 *
 * The icon is the site's own, with its initial underneath for the ones that answer with nothing: the
 * same treatment a token gets in the holdings list, drawn by the same component.
 *
 * 48px tall rather than 56: a row of these is a list of names to scan, not a set of targets to aim at,
 * and the taller tile was spending the difference on empty space above and below a 32px icon. The
 * horizontal padding and the gap come down with it, so the proportions hold rather than the label
 * drifting away from its icon.
 *
 * What a tap does is the caller's business rather than this component's, which is what lets the
 * favourites reuse the tile to open its editor instead of its address.
 * @param {object} props Component props.
 * @param {string} props.url Address, used for the icon and handed back on click.
 * @param {string} props.name Label for the tile.
 * @param {string} [props.symbol] Fallback for the icon, when the name is not what should be shown there.
 * @param {string} [props.title] Tooltip, for a label that does not carry the whole address.
 * @param {boolean} [props.ltr] Reads the label left-to-right inside a right-to-left interface.
 * @param {boolean} [props.primary] Tints the icon fallback, marking a shortcut the app chose over one the user made.
 * @param {string} [props.className] Extra classes; conflicting utilities override the defaults.
 * @param {(url: string) => void} props.onPick What the tile does when it is tapped.
 * @returns {JSX.Element} The tile.
 */
function BrowserShortcut({ url, name, symbol, title, ltr = false, primary = false, className = '', onPick }: { url: string; name: string; symbol?: string; title?: string; ltr?: boolean; primary?: boolean; className?: string; onPick: (url: string) => void })
{
    return (
        <Button
            title={ title }
            variant='muted'
            onClick={ () => { onPick(url); } }
            className={ cn('h-12 gap-2.5 rounded-xl px-2.5 text-start', className) }>

            <TokenIcon
                kind='unknown'
                src={ getSiteIcon(url) }
                symbol={ symbol ?? name }
                primary={ primary }
                className='size-8 text-tiny' />

            <Text
                variant='body'
                className='flex-1 truncate'>

                <span dir={ ltr ? 'ltr' : undefined }>

                    { name }

                </span>

            </Text>

        </Button>
    );
}

/**
 * DashboardBrowserStart - What a tab shows before it has been given an address.
 *
 * Its own component because the browser holds a frame per tab now, and leaving this inline would have
 * nested ninety lines of start screen inside that loop for the one tab in front to render.
 *
 * Two lists, both shared by every tab: the favourites, which are the shortcuts the wallet keeps, and
 * the visited ones, which are what it has opened before. The kept list comes first because it is the
 * same every time and can be aimed at from memory, while the second moves as it is used. Neither is the
 * per-tab back stack the toolbar arrows walk.
 *
 * The explorer is the head of the favourites grid rather than an entry in it, because it is the one
 * shortcut with no address to store: it follows the active network and this account, so it says
 * something different on every chain and drops out entirely on a chain that declares no explorer. It
 * steps out of the way in edit mode, which shows only what editing can reach.
 *
 * The favourites carry an edit mode rather than an always-visible remove control on every tile. Out of
 * that mode the tiles are what they are for — one tap, one site — and the controls that could lose
 * something are behind a deliberate switch. Inside it the grid becomes a single column: a row then has
 * room for the tile and its own remove button side by side, which two per line at 360px does not.
 * @param {object} props Component props.
 * @param {{ name: string; url: string }} [props.explorer] The active network's explorer, on this account.
 * @param {BrowserFavorite[]} props.favorites The kept shortcuts.
 * @param {BrowserVisit[]} props.visits The visited sites, newest first.
 * @param {string} props.notice Why the native view could not be created, when it could not be.
 * @param {(url: string) => void} props.onOpen Opens an address in this tab.
 * @param {(item: BrowserFavorite) => void} props.onFavoriteSave Adds a favourite, or replaces the one holding that id.
 * @param {(id: string) => void} props.onFavoriteRemove Drops a favourite.
 * @returns {JSX.Element} The start screen.
 */
export default function DashboardBrowserStart({ explorer, favorites, visits, notice, onOpen, onFavoriteSave, onFavoriteRemove }: { explorer?: { name: string; url: string }; favorites: BrowserFavorite[]; visits: BrowserVisit[]; notice: string; onOpen: (url: string) => void; onFavoriteSave: (item: BrowserFavorite) => void; onFavoriteRemove: (id: string) => void })
{
    const [ editing, setEditing ] = useState(false);

    // Which favourite the dialog is open on: an item to edit one, `true` to add, `false` for closed.
    // One piece of state rather than an open flag beside a selection, so the two cannot disagree about
    // whether the dialog is showing an entry that is no longer there.
    const [ editor, setEditor ] = useState<BrowserFavorite | boolean>(false);

    return (
        <Vertical className='size-full gap-3 overflow-y-auto p-4'>

            <SectionHeader title={ T('Dashboard.Browser.Favorite') }>

                <Button
                    variant='muted'
                    onClick={ () => { setEditing(!editing); } }
                    className='h-8 gap-1 rounded-lg px-3 text-tiny'
                    leftIcon={ editing ? <FiCheck size={ 14 } /> : <FiEdit3 size={ 14 } /> }
                    text={ editing ? T('Dashboard.Browser.FavoriteDone') : T('Dashboard.Browser.FavoriteManage') } />

            </SectionHeader>

            {
                favorites.length === 0 && explorer === undefined && !editing ?
                    <EmptyState panel text={ T('Dashboard.Browser.FavoriteEmpty') } /> :
                    (
                        <div className={ cn(editing ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2') }>

                            {
                                explorer !== undefined && !editing &&
                                (
                                    <BrowserShortcut
                                        primary
                                        url={ explorer.url }
                                        name={ explorer.name }
                                        onPick={ onOpen } />
                                )
                            }

                            {
                                favorites.map((item) => (
                                    editing ?
                                        (
                                            <Horizontal
                                                key={ item.id }
                                                className='items-center gap-2'>

                                                <BrowserShortcut
                                                    primary
                                                    url={ item.url }
                                                    name={ item.name }
                                                    title={ item.url }
                                                    className='min-w-0 flex-1'
                                                    onPick={ () => { setEditor(item); } } />

                                                <Button
                                                    variant='danger'
                                                    size='icon'
                                                    onClick={ () => { onFavoriteRemove(item.id); } }
                                                    aria-label={ T('Dashboard.Browser.FavoriteRemove') }
                                                    className='shrink-0'>

                                                    <FiTrash2 size={ 16 } />

                                                </Button>

                                            </Horizontal>
                                        ) :
                                        (
                                            <BrowserShortcut
                                                primary
                                                key={ item.id }
                                                url={ item.url }
                                                name={ item.name }
                                                title={ item.url }
                                                onPick={ onOpen } />
                                        )
                                ))
                            }

                            {
                                editing &&
                                (
                                    <Button
                                        variant='normal'
                                        size='action'
                                        onClick={ () => { setEditor(true); } }
                                        leftIcon={ <FiPlus size={ 16 } /> }
                                        text={ T('Dashboard.Browser.FavoriteAdd') } />
                                )
                            }

                        </div>
                    )
            }

            <SectionHeader title={ T('Dashboard.Browser.Recent') } />

            {
                visits.length === 0 ?
                    <EmptyState panel text={ T('Dashboard.Browser.RecentEmpty') } /> :
                    (
                        <div className='grid grid-cols-2 gap-2'>

                            {
                                /*
                                 * The host alone names the row, which is what makes two of these fit on
                                 * a line. The full address used to sit under it and cannot survive half
                                 * a row — it truncated to an ellipsis and took the host's width with
                                 * it, so it moved to the tooltip.
                                 */
                                visits.map((item) => (
                                    <BrowserShortcut
                                        ltr
                                        key={ item.url }
                                        url={ item.url }
                                        name={ getSiteHost(item.url) }
                                        symbol={ getSiteHost(item.url).toUpperCase() }
                                        title={ item.url }
                                        onPick={ onOpen } />
                                ))
                            }

                        </div>
                    )
            }

            {
                notice.length > 0 &&
                (
                    <Vertical className='mt-auto gap-1'>

                        <Text
                            className='text-txt-muted/70'
                            text={ T('Dashboard.Browser.Hint') } />

                        <Alert
                            dir='ltr'
                            variant='danger'
                            className='px-2 py-1 text-start font-mono'
                            text={ notice } />

                    </Vertical>
                )
            }

            {
                editor !== false &&
                (
                    <DashboardBrowserFavorite
                        item={ editor === true ? undefined : editor }
                        onSave={ (item) => { onFavoriteSave(item); setEditor(false); } }
                        onClose={ () => { setEditor(false); } } />
                )
            }

        </Vertical>
    );
}
