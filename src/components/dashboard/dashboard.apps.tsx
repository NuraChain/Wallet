import { MdDragIndicator } from 'react-icons/md';
import { Reorder, useDragControls } from 'motion/react';
import { useEffect, useState } from 'react';
import { FiCheck, FiEdit3, FiPlus, FiTrash2 } from 'react-icons/fi';

import Text from '../ui/text';
import Button from '../ui/button';
import SiteForm from '../site.form';
import StatusBlock from '../ui/state';
import TokenIcon from '../token.icon';
import SectionHeader from '../ui/section';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { loadConnections, siteOrigin } from '../../core/dapp';
import { getSiteHost, getSiteIcon } from '../../core/browser';
import { getApps, setApps, type DappEntry } from '../../core/apps';
import { Horizontal, Vertical } from '../ui/stack';

/**
 * The lift under an app's icon.
 *
 * Every other logo in the wallet lies flat on its surface. These sit slightly proud of theirs, which
 * is the honest claim about what they are: other people's sites resting on your wallet, put there by
 * you and liftable off again. It is one soft shadow at the same colour the glass casts, so nothing new
 * enters the palette to say it.
 *
 * A recess was tried first and cut. Pressing the icon *into* the glass reads beautifully in the dark
 * theme and disappears entirely in the light one, where every available surface token is lighter than
 * the card it would sit on — and a detail that needs a token the system does not have is a detail the
 * system was not asking for.
 */
const iconLift = 'shadow-raise';

/**
 * AppIcon - An app's own icon, lifted off the card.
 * @param {object} props Component props.
 * @param {DappEntry} props.item The app.
 * @param {string} props.className Sizing and corner for the icon.
 * @returns {JSX.Element} The icon.
 */
function AppIcon({ item, className }: { item: DappEntry; className: string })
{
    return (
        <TokenIcon
            primary
            kind='unknown'
            src={ getSiteIcon(item.url) }
            symbol={ item.name }
            className={ cn(iconLift, className) } />
    );
}

/**
 * AppHost - The origin under an app's name, and whether it already holds a grant.
 *
 * The name on a tile is whatever the user typed; the host is the thing their address is actually
 * handed to. So it is set in the face this wallet writes addresses and hashes in — mono, muted, the
 * same register as every other machine fact on screen — which is a claim about what it is, not a
 * decoration. It is also the only part of a tile that cannot be renamed into a lie.
 *
 * The marker is the wallet's own indicator shape, the 2px-radius square Swiper's pagination draws,
 * rather than a dot. It sits inline with the host rather than in the corner of the tile because the
 * grant belongs to the origin and not to the app: renaming the tile does not move it, and re-aiming
 * the tile at another site does.
 *
 * Colour never carries it alone — the tile's tooltip says the same thing in words.
 * @param {object} props Component props.
 * @param {DappEntry} props.item The app.
 * @param {boolean} props.connected Whether this app's origin is allowed to see the account.
 * @returns {JSX.Element} The host line.
 */
function AppHost({ item, connected }: { item: DappEntry; connected: boolean })
{
    return (
        <Horizontal className='min-w-0 items-center gap-1.5'>

            {
                connected && <span aria-hidden className='size-1.5 shrink-0 rounded-xs bg-txt-success' />
            }

            { /*
              * The host is Latin however the interface reads, so it is isolated rather than aligned:
              * the span keeps its characters in order and the card keeps the line on its own start
              * edge, which is what a Persian layout needs and what `dir='ltr'` on the line itself
              * would have taken away.
              */ }
            <Text
                variant='caption'
                className='min-w-0 flex-1 truncate font-mono'>

                <span dir='ltr'>

                    { getSiteHost(item.url) }

                </span>

            </Text>

        </Horizontal>
    );
}

/**
 * AppRow - One app while the list is being edited: a grip, the app, and its remove control.
 *
 * Its own component because of the grip. Dragging is driven by `useDragControls` rather than by the
 * row listening for its own pointer events, and a hook cannot be called inside the loop that renders
 * the rows — so the loop renders these instead.
 *
 * The grip exists for the same reason the drag controls do: the row is also a button that opens the
 * editor, and a row that both drags and taps has to guess which one a short press meant. It never
 * guesses here — the grip drags, the tile opens, and neither can be mistaken for the other.
 * @param {object} props Component props.
 * @param {DappEntry} props.item The app this row shows.
 * @param {boolean} props.connected Whether this app's origin is allowed to see the account.
 * @param {(item: DappEntry) => void} props.onEdit Opens the editor on this app.
 * @param {(id: string) => void} props.onRemove Drops this app.
 * @returns {JSX.Element} The row.
 */
function AppRow({ item, connected, onEdit, onRemove }: { item: DappEntry; connected: boolean; onEdit: (item: DappEntry) => void; onRemove: (id: string) => void })
{
    const controls = useDragControls();

    return (
        <Reorder.Item
            as='div'
            value={ item }
            dragListener={ false }
            dragControls={ controls }
            className='flex items-center gap-2'>

            { /*
              * `touch-none` on the grip rather than on the row: the browser would otherwise read the
              * first millimetre of a drag as a scroll and take the gesture away mid-move, which on a
              * phone is every drag. Only the grip gives that up, so the rest of the list still scrolls
              * with a finger.
              */ }
            <Button
                variant='muted'
                size='icon'
                onPointerDown={ (event) => { controls.start(event); } }
                aria-label={ T('Dashboard.Apps.Reorder') }
                className='shrink-0 cursor-grab touch-none text-txt-muted active:cursor-grabbing'>

                <MdDragIndicator size={ 18 } />

            </Button>

            <Button
                variant='muted'
                title={ item.url }
                onClick={ () => { onEdit(item); } }
                className='min-w-0 flex-1 justify-start gap-2.5 rounded-surface p-2 text-start'>

                <AppIcon
                    item={ item }
                    className='size-8 rounded-control text-tiny' />

                <Vertical className='min-w-0 flex-1 gap-0.5'>

                    <Text
                        variant='body'
                        className='truncate'
                        text={ item.name } />

                    <AppHost item={ item } connected={ connected } />

                </Vertical>

            </Button>

            <Button
                variant='danger'
                size='icon'
                onClick={ () => { onRemove(item.id); } }
                aria-label={ T('Dashboard.Apps.Remove') }
                className='shrink-0'>

                <FiTrash2 size={ 16 } />

            </Button>

        </Reorder.Item>
    );
}

/**
 * DashboardApps - The dApps the wallet keeps, and the mode that manages them.
 *
 * A shelf rather than a catalogue: what is here is what the user put here, seeded with Nura Swap.
 * There is no directory to browse and nothing is fetched — an app is a name and an address, kept on
 * the device, and opening one hands it to the in-app browser where the wallet provider is already
 * injected.
 *
 * The tiles are start-aligned with the icon above the name rather than centred over it, which is the
 * one layout decision the rest follows from. A launcher centres because the label is the whole truth
 * about the thing; here it is not — the name is whatever was typed and the host is what the account is
 * handed to — and a centred tile has nowhere to put the second line that does not read as a caption.
 * Start-aligned, the tile is the same grammar as every other row in this wallet that names something
 * you can act on: a title with a muted machine fact under it.
 *
 * Out of edit mode the tiles are what they are for: one tap, one app, and no control that could lose
 * anything. Inside it the grid becomes a single column, which is the same trade the browser's
 * favourites make and for the same reason — a row then has room for the grip, the app and its remove
 * control side by side, which two tiles per line at 360px does not. It is also what makes reordering
 * legible: a list has one axis, so a drag has one meaning.
 *
 * The stored list is written on every change rather than on leaving edit mode. Nothing here is a draft
 * — a removed app is removed — and a tab the user swipes away from mid-edit should not quietly undo
 * what they did.
 * @param {object} props Component props.
 * @param {boolean} props.active Whether this is the tab on screen.
 * @param {(url: string) => void} props.onOpen Opens one app in the browser tab.
 * @returns {JSX.Element} The apps tab.
 */
export default function DashboardApps({ active, onOpen }: { active: boolean; onOpen: (url: string) => void })
{
    const [ apps, setList ] = useState<DappEntry[]>([]);
    const [ granted, setGranted ] = useState<string[]>([]);
    const [ editing, setEditing ] = useState(false);

    // Which app the dialog is open on: an item to edit one, `true` to add, `false` for closed. One
    // piece of state rather than an open flag beside a selection, so the two cannot disagree about
    // whether the dialog is showing an entry that is no longer there.
    const [ editor, setEditor ] = useState<DappEntry | boolean>(false);

    useEffect(() =>
    {
        let alive = true;

        void getApps().then((stored) =>
        {
            if (alive)
            {
                setList(stored);
            }
        });

        return () =>
        {
            alive = false;
        };
    }, [ ]);

    // Re-read on arrival rather than once at mount. Swiper builds all three panels up front, so this
    // one is constructed long before it is looked at — and the grants change on the tab next door,
    // where connecting to a site is the whole point. Landing here is exactly when the answer is worth
    // asking for again, and it is the cheapest place to notice. A grant made while this tab is already
    // on screen still waits for the next visit, which is the one case this does not cover.
    useEffect(() =>
    {
        if (!active)
        {
            return undefined;
        }

        let alive = true;

        void loadConnections().then((list) =>
        {
            if (alive)
            {
                setGranted(list);
            }
        });

        return () =>
        {
            alive = false;
        };
    }, [ active ]);

    /**
     * commit - Shows a new list and stores it.
     *
     * The write is not awaited and its failure is not reported: the list is on screen either way, and
     * a shelf of shortcuts is not worth an error dialog over. A store that could not be written is a
     * store that will hand back the previous list on the next launch, which is the honest outcome.
     * @param {DappEntry[]} list The list as it now stands.
     * @returns {void}
     */
    const commit = (list: DappEntry[]) =>
    {
        setList(list);

        void setApps(list);
    };

    /**
     * onSave - Takes the dialog's result, as an edit when the id is already known and as an addition
     * when it is not.
     *
     * Replaced in place rather than removed and appended, so editing an app's address leaves it where
     * it was on the shelf.
     * @param {DappEntry} item The app the dialog produced.
     * @returns {void}
     */
    const onSave = (item: DappEntry) =>
    {
        const known = apps.some((entry) => entry.id === item.id);

        commit(known ? apps.map((entry) => (entry.id === item.id ? item : entry)) : [ ...apps, item ]);

        setEditor(false);
    };

    /**
     * isGranted - Whether one app's origin is already allowed to see the account.
     * @param {DappEntry} item The app.
     * @returns {boolean} True when the origin holds a grant.
     */
    const isGranted = (item: DappEntry) => granted.includes(siteOrigin(item.url));

    /**
     * tileTitle - The tooltip on an app, which is where the connection reads in words.
     *
     * The marker on the host line is a coloured square and nothing else, so on its own it is a fact
     * only a sighted user with the palette in mind can read. This is the same fact, spelled.
     * @param {DappEntry} item The app.
     * @returns {string} The full address, and its connection when it has one.
     */
    const tileTitle = (item: DappEntry) => (isGranted(item) ? `${ item.url } — ${ T('Dashboard.Apps.Connected') }` : item.url);

    return (
        <Vertical className='mt-2 gap-4'>

            <SectionHeader title={ T('Dashboard.Apps.Title') }>

                <Button
                    variant='muted'
                    size='small'
                    onClick={ () => { setEditing(!editing); } }
                    leftIcon={ editing ? <FiCheck size={ 14 } /> : <FiEdit3 size={ 14 } /> }
                    text={ editing ? T('Dashboard.Apps.Done') : T('Dashboard.Apps.Manage') } />

            </SectionHeader>

            {
                editing ?
                    (
                        <Vertical className='gap-2'>

                            {
                                apps.length > 1 &&
                                (
                                    <Text
                                        variant='caption'
                                        text={ T('Dashboard.Apps.Reorder') } />
                                )
                            }

                            <Reorder.Group
                                as='div'
                                axis='y'
                                values={ apps }
                                onReorder={ commit }
                                className='flex flex-col gap-2'>

                                {
                                    apps.map((item) => (
                                        <AppRow
                                            key={ item.id }
                                            item={ item }
                                            connected={ isGranted(item) }
                                            onEdit={ setEditor }
                                            onRemove={ (id) => { commit(apps.filter((entry) => entry.id !== id)); } } />
                                    ))
                                }

                            </Reorder.Group>

                            <Button
                                variant='normal'
                                size='action'
                                onClick={ () => { setEditor(true); } }
                                leftIcon={ <FiPlus size={ 16 } /> }
                                text={ T('Dashboard.Apps.Add') } />

                        </Vertical>
                    ) :
                    (
                        <div className='grid grid-cols-2 gap-3 empty:hidden'>

                            {
                                /*
                                 * The `normal` fill rather than `muted`. These tiles are the whole of
                                 * what this tab has to say, and `muted` is 20% white — over the light
                                 * theme's pale aurora it left them as ghosts of cards. `normal` is the
                                 * same translucent glass the wallet tab gives its holdings rows, which
                                 * is the right weight for content that is the point of the screen
                                 * rather than a control sitting beside it.
                                 */
                                apps.map((item) => (
                                    <Button
                                        key={ item.id }
                                        variant='normal'
                                        title={ tileTitle(item) }
                                        onClick={ () => { onOpen(item.url); } }
                                        className='h-30 flex-col items-start justify-start gap-3 rounded-surface p-3 text-start'>

                                        <AppIcon
                                            item={ item }
                                            className='size-10 rounded-surface text-small' />

                                        <Vertical className='mt-auto w-full min-w-0 gap-1'>

                                            <Text
                                                variant='body'
                                                className='w-full truncate'
                                                text={ item.name } />

                                            <AppHost item={ item } connected={ isGranted(item) } />

                                        </Vertical>

                                    </Button>
                                ))
                            }

                        </div>
                    )
            }

            { /*
              * An empty shelf carries the way off it. Left as a sentence alone it was a dead end that
              * told the user to press Edit first, which is a step the tab has no reason to charge for.
              */ }
            {
                !editing && apps.length === 0 &&
                (
                    <Vertical className='gap-3'>

                        <StatusBlock panel text={ T('Dashboard.Apps.Empty') } />

                        <Button
                            variant='normal'
                            size='action'
                            onClick={ () => { setEditor(true); } }
                            leftIcon={ <FiPlus size={ 16 } /> }
                            text={ T('Dashboard.Apps.Add') } />

                    </Vertical>
                )
            }

            {
                editor !== false &&
                (
                    <SiteForm
                        item={ editor === true ? undefined : editor }
                        title={ editor === true ? T('Dashboard.Apps.Add') : T('Dashboard.Apps.Edit') }
                        onSave={ onSave }
                        onClose={ () => { setEditor(false); } } />
                )
            }

        </Vertical>
    );
}
