import type { Network } from '../../core/network';

import { useEffect, useRef, useState } from 'react';
import { IoClose } from 'react-icons/io5';
import { AnimatePresence, motion } from 'motion/react';
import { FiArrowLeft, FiArrowRight, FiHome, FiRotateCw, FiSearch, FiSettings } from 'react-icons/fi';

import WebFrame from '../../layout/webview';
import DashboardBrowserTabs from './dashboard.browser.tabs';
import DashboardBrowserStart from './dashboard.browser.start';
import DashboardBrowserSettings from './dashboard.browser.settings';

import Button from '../ui/button';
import { TextField } from '../ui/field';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { imageCache } from '../../core/image';
import { addBrowserVisit, atBrowserStart, clearBrowserHistory, frameLabel, getBrowserFavorites, getBrowserHistory, getBrowserView, getNativeBrowser, getNativeTab, onNativeBrowserState, setBrowserFavorites, setBrowserView, type BrowserFavorite, type BrowserState, type BrowserTab, type BrowserVisit, type BrowserView } from '../../core/browser';

/**
 * Turn whatever was typed in the address bar into a loadable URL.
 *
 * A bare host gets `https://` prepended; anything that does not look like a host is treated as a search query.
 * @param {string} value Raw address-bar input.
 * @returns {string} An absolute URL, or an empty string for empty input.
 */
const toUrl = (value: string) =>
{
    const trimmed = value.trim();

    if (trimmed.length === 0)
    {
        return '';
    }

    if ((/^https?:\/\//iu).test(trimmed))
    {
        return trimmed;
    }

    if ((/^[^\s/]+\.[^\s]{2,}/u).test(trimmed))
    {
        return `https://${ trimmed }`;
    }

    return `https://duckduckgo.com/?q=${ encodeURIComponent(trimmed) }`;
};

/**
 * DashboardBrowser - In-app web browser for dApps and explorers.
 *
 * The page itself is painted by `WebFrame`, which owns the child webview and its iframe fallback.
 * What lives here is the chrome around it: the toolbar, the start screen, and a navigation stack kept
 * in this component rather than the webview's own, since the child-webview API exposes no `navigate`
 * and every step is a fresh view.
 *
 * Tabs are held here, one navigation stack each, and every one of them keeps its own view alive: the
 * frame belonging to the tab in front is the only one shown, the rest are hidden where they stand. So
 * picking a tab is instant and nothing is reloaded, which is the whole point of having tabs at all.
 *
 * Two lists make up the start screen. The suggested sites are fixed and come from `core/browser`; the
 * visited ones are every site opened from this wallet, persisted across restarts. Both are shortcuts,
 * shared by all tabs, and neither is the per-tab back stack the toolbar arrows walk.
 *
 * This tab runs edge to edge and the dashboard's nav bar stays down while it is open, so the toolbar
 * is also the only way out — hence the exit button sitting ahead of the navigation controls.
 * @param {object} props Component props.
 * @param {string} props.address The account address, used for the explorer shortcut.
 * @param {Network} props.network The active network.
 * @param {boolean} props.enabled Whether this tab is the visible one and no modal is open.
 * @param {string} props.request A URL another tab asked this one to open.
 * @param {number} props.ticket Bumped by the caller for every request, so the same URL can be opened twice.
 * @param {() => void} props.onExit Leaves the browser for the wallet tab.
 * @returns {JSX.Element} The browser tab.
 */
export default function DashboardBrowser({ address, network, enabled, request, ticket, onExit }: { address: string; network: Network; enabled: boolean; request: string; ticket: number; onExit: () => void })
{
    const [ settings, setSettings ] = useState(false);
    const [ view, setView ] = useState<BrowserView>('mobile');
    const [ visits, setVisits ] = useState<BrowserVisit[]>([]);
    const [ favorites, setFavorites ] = useState<BrowserFavorite[]>([]);
    const [ icons, setIcons ] = useState({ bytes: 0, count: 0 });
    const [ active, setActive ] = useState(1);
    const [ tabs, setTabs ] = useState<BrowserTab[]>([ { id: 1, entries: [], index: -1, draft: '', reload: 0, home: false } ]);

    // A counter and not state: an id has to be unique against every tab that has ever existed, and two
    // clicks landing in one commit would read the same value out of a render. Ids are never recycled
    // because one names a child webview — handing a new tab a label a closing tab still answers to
    // would let the teardown of the old one land on the new one's view.
    const mintRef = useRef(2);

    // Keyed by tab rather than held flat, because every tab has a page of its own to report on. Maps
    // and not objects for the sake of one line: closing a tab has to forget its entry, and a numeric
    // key survives a `Map` unchanged where an object would turn it into a string.
    const [ live, setLive ] = useState<Map<number, BrowserState>>(new Map());
    const [ notice, setNotice ] = useState<Map<number, string>>(new Map());

    // Closing the last tab leaves a fresh one behind, so there is always a tab in front to read from.
    const tab = tabs.find((item) => item.id === active) ?? tabs[0];

    const current = tab.index < 0 ? '' : tab.entries[tab.index];

    // The start screen and the tab strip are one surface: the strip is how a tab is picked, and it
    // belongs with the shortcuts rather than over a page that is trying to be read.
    const start = atBrowserStart(tab);

    const state = live.get(tab.id);

    const native = getNativeBrowser() !== undefined;

    // The native view keeps its own history, so links followed inside a page are navigable too — the
    // component's stack only ever sees what was typed or handed over. Off Android there is no such
    // view and the stack is all there is.
    // On the start screen the step back is out of it, onto the page it was laid over — so the control
    // is live there whatever the page's own history says.
    const canBack = tab.home || (native ? state?.canBack === true : tab.index >= 0);
    const canForward = native ? state?.canForward === true : tab.index < tab.entries.length - 1;

    /**
     * Rewrites one tab and leaves the others alone.
     */
    const patch = (id: number, change: (item: BrowserTab) => BrowserTab) =>
    {
        setTabs((list) => list.map((item) => (item.id === id ? change(item) : item)));
    };

    // Registered against the current tab list rather than once on mount: the bridge names the tab an
    // update belongs to and that name has to be resolved to one of these. An APK from before tabs
    // sends no name and only ever had one page, so its updates belong to whichever tab is in front.
    useEffect(() => onNativeBrowserState((update) =>
    {
        const target = update.id === undefined ? active : tabs.find((item) => frameLabel(item.id) === update.id)?.id;

        if (target === undefined)
        {
            return;
        }

        setLive((map) => new Map(map).set(target, update));

        // A page reached by following links is not on the stack, so its address has to come from the
        // view that navigated there.
        if (update.url.length > 0)
        {
            patch(target, (item) => ({ ...item, draft: update.url }));
        }
    }), [ tabs, active ]);

    // Read once on mount rather than at module scope: this is the only surface that needs either
    // value, and a store read that fails here costs a start screen its shortcuts instead of leaving
    // the whole app unresolved the way the awaits in `app.tsx` do.
    useEffect(() =>
    {
        const load = async() =>
        {
            setView(await getBrowserView());
            setVisits(await getBrowserHistory());
            setFavorites(await getBrowserFavorites());
        };

        void load();
    }, []);

    // Measured when the settings dialog opens rather than held all the time: it is a figure only that
    // dialog shows, and reading it walks the cache index. Scoped to `unknown`, which is the kind the
    // browser's own tiles and chips store their icons under — the wallet's token and network logos
    // share this cache and are deliberately not counted here or cleared below.
    useEffect(() =>
    {
        if (!settings)
        {
            return;
        }

        void imageCache.getCacheSize('unknown').then(setIcons);
    }, [ settings ]);

    // The one shortcut the start screen is handed rather than stores: it points at the active network's
    // explorer, on this account, so it means something different on each chain — and it is absent
    // entirely on a network that declares none. Everything else in that grid is a favourite.
    const explorer = network.explorerUrl.length > 0 ? { name: T('Dashboard.Browser.Explorer'), url: `${ network.explorerUrl }/address/${ address }` } : undefined;

    const onOpen = (value: string) =>
    {
        const url = toUrl(value);

        if (url.length === 0)
        {
            return;
        }

        // Opened from the start screen of a tab that already holds a page, this becomes a new tab
        // rather than a navigation. That screen is only over a live page because Home put it there and
        // deliberately kept the page alive underneath; loading into the same tab would throw away the
        // one thing that decision was for, and it is why the strip only ever had one chip in it — every
        // site opened after the first replaced the site before it, so no second tab was ever created.
        //
        // A tab with no page of its own is not in that position: it is the empty tab the `+` just made,
        // and filling it is exactly what it is for. Navigating from a page that is on screen is an
        // ordinary navigation and stays in place, the way an address bar is supposed to behave.
        const spawn = tab.home && tab.index >= 0;

        const id = spawn ? mintRef.current : active;

        if (spawn)
        {
            mintRef.current += 1;

            setTabs([ ...tabs, { id, entries: [ url ], index: 0, draft: url, reload: 0, home: false } ]);

            setActive(id);
        }
        else
        {
            patch(active, (item) =>
            {
                const next = [ ...item.entries.slice(0, item.index + 1), url ];

                return { ...item, entries: next, index: next.length - 1, draft: url, home: false };
            });
        }

        setNotice((map) => new Map(map).set(id, ''));

        // Recorded here rather than from the webview's own navigation events: this is what the user
        // asked for, while the events also fire for redirects and for every link followed inside a
        // page, which would fill the list with places nobody chose to go.
        void addBrowserVisit(url).then(setVisits);
    };

    // A link handed over from another tab (an activity row, say) lands on the history stack exactly as
    // if it had been typed here, so back still returns to whatever the user was browsing before.
    useEffect(() =>
    {
        if (ticket > 0 && request.length > 0)
        {
            onOpen(request);
        }
    }, [ ticket, request ]);

    const onStep = (offset: number) =>
    {
        // Leaving the start screen is the step the user took to get here, so it is the one back undoes
        // before the page's own history is touched.
        if (tab.home && offset < 0)
        {
            patch(active, (item) => ({ ...item, home: false }));

            return;
        }

        const bridge = getNativeTab(frameLabel(active));

        if (bridge !== undefined)
        {
            if (offset < 0)
            {
                bridge.back();
            }
            else
            {
                bridge.forward();
            }

            return;
        }

        const next = tab.index + offset;

        if (next < 0 || next >= tab.entries.length)
        {
            return;
        }

        patch(active, (item) => ({ ...item, index: next, draft: item.entries[next], home: false }));
    };

    /**
     * Shows the start screen over the tab, leaving the page it holds alone.
     *
     * This used to clear the stack, which emptied the address and took the view down with it — going
     * home meant losing the page and reloading it from scratch on the way back. The page now stays
     * where it is, hidden behind the start screen, and picking the tab in the strip returns to it.
     */
    const onHome = () =>
    {
        patch(active, (item) => ({ ...item, home: true }));
    };

    /**
     * Brings a tab to the front, showing whatever page it holds.
     *
     * Picking a tab is also the way back out of the start screen, since the strip is only on screen
     * while that is what the front tab shows. A tab with no page of its own simply stays there.
     */
    const onPickTab = (id: number) =>
    {
        setActive(id);

        patch(id, (item) => ({ ...item, home: false }));
    };

    /**
     * Opens a tab and brings it to the front, on its start screen.
     *
     * Ids are minted rather than reused, since one names a child webview and a recycled id would hand
     * a new tab the view the closed one left behind.
     */
    const onAddTab = () =>
    {
        const id = mintRef.current;

        mintRef.current += 1;

        setTabs([ ...tabs, { id, entries: [], index: -1, draft: '', reload: 0, home: false } ]);

        setActive(id);
    };

    /**
     * Closes a tab, and with it the view that tab owned — unmounting the frame is what tears it down.
     *
     * Closing the one in front falls to its left neighbour, which is where the eye already is. Closing
     * the last tab leaves an empty one rather than an empty browser: there is no state in which this
     * page has no tab, so nothing downstream has to describe one.
     */
    const onCloseTab = (id: number) =>
    {
        const at = tabs.findIndex((item) => item.id === id);

        if (at < 0)
        {
            return;
        }

        const rest = tabs.filter((item) => item.id !== id);

        if (rest.length === 0)
        {
            const fresh = mintRef.current;

            mintRef.current += 1;

            setTabs([ { id: fresh, entries: [], index: -1, draft: '', reload: 0, home: false } ]);

            setActive(fresh);
        }
        else
        {
            setTabs(rest);

            if (id === active)
            {
                setActive(rest[Math.max(0, at - 1)].id);
            }
        }

        setLive((map) => { const next = new Map(map); next.delete(id); return next; });
        setNotice((map) => { const next = new Map(map); next.delete(id); return next; });
    };

    const onView = (chosen: BrowserView) =>
    {
        setView(chosen);

        void setBrowserView(chosen);
    };

    // Cleared and re-measured in one step, so the count the dialog shows is what the cache now holds
    // rather than what it held when the dialog opened.
    const onClearCache = () =>
    {
        const run = async() =>
        {
            await imageCache.clearKind('unknown');

            setIcons(await imageCache.getCacheSize('unknown'));
        };

        void run();
    };

    const onClear = () =>
    {
        setVisits([]);

        void clearBrowserHistory();
    };

    // Written through the same call that updates the screen, so the list on disk is whatever is being
    // looked at. An edit replaces the entry holding that id and an addition goes on the end, which is
    // the one place the two cases differ.
    const onFavorites = (next: BrowserFavorite[]) =>
    {
        setFavorites(next);

        void setBrowserFavorites(next);
    };

    const onFavoriteSave = (item: BrowserFavorite) =>
    {
        onFavorites(favorites.some((held) => held.id === item.id) ? favorites.map((held) => (held.id === item.id ? item : held)) : [ ...favorites, item ]);
    };

    const onFavoriteRemove = (id: string) =>
    {
        onFavorites(favorites.filter((item) => item.id !== id));
    };

    return (
        <div className='relative flex min-h-0 flex-1 flex-col'>

            { /* `base-1` is the 0.25-alpha token in both themes; `base-2` sits at 0.6/0.55 and read as solid. */ }
            <div className='flex shrink-0 items-center gap-1.5 border-b border-glass-line bg-base-1 p-2 backdrop-blur-xl'>

                <Button
                    variant='chip'
                    size='iconChip'
                    aria-label={ T('Dashboard.Browser.Exit') }
                    onClick={ onExit }
                    className='shrink-0 disabled:opacity-40'>

                    <IoClose size={ 18 } />

                </Button>

                { /*
                  * Back and forward are mirror images of one glyph, so `rtl:` turns each into the
                  * other instead of the component picking between two icons at render time.
                  */ }
                <Button
                    variant='chip'
                    size='iconChip'
                    disabled={ !canBack }
                    aria-label={ T('Dashboard.Browser.Back') }
                    onClick={ () => { onStep(-1); } }
                    className='shrink-0 disabled:opacity-40'>

                    <FiArrowLeft size={ 16 } className='rtl:rotate-180' />

                </Button>

                <Button
                    variant='chip'
                    size='iconChip'
                    disabled={ !canForward }
                    aria-label={ T('Dashboard.Browser.Forward') }
                    onClick={ () => { onStep(1); } }
                    className='shrink-0 disabled:opacity-40'>

                    <FiArrowRight size={ 16 } className='rtl:rotate-180' />

                </Button>

                <div className='min-w-0 flex-1'>

                    <TextField
                        dir={ tab.draft.length > 0 ? 'ltr' : undefined }
                        value={ tab.draft }
                        placeholder={ T('Dashboard.Browser.Placeholder') }
                        onValue={ (value) => { patch(active, (item) => ({ ...item, draft: value })); } }
                        onEnter={ () => { onOpen(tab.draft); } }
                        className='h-9 truncate rounded-xl ps-8 pe-8 text-tiny'
                        leading={ <FiSearch size={ 14 } className='pointer-events-none absolute inset-s-2.5 text-txt-muted' /> }
                        trailing={
                            current.length > 0 ?
                                (
                                    <Button
                                        aria-label={ T('Dashboard.Browser.Reload') }
                                        onClick={ () => { patch(active, (item) => ({ ...item, reload: item.reload + 1, home: false })); } }
                                        className='absolute inset-e-2.5 cursor-pointer text-txt-muted hover:text-txt-normal'>

                                        { /* Spinning the reload glyph is the in-flight cue; it is the same
                                          * control either way, so nothing moves when the load ends. */ }
                                        <FiRotateCw size={ 14 } className={ state?.loading === true ? 'animate-spin' : '' } />

                                    </Button>
                                ) :
                                undefined
                        } />

                </div>

                { /*
                  * One control, two jobs, because on the start screen the first of them has nothing to
                  * do: home is already what is showing, so the button sat there greyed out taking up
                  * the width. It turns into the way into the browser's settings there instead, and
                  * goes back to being home the moment a page is up — which is the only time home means
                  * anything.
                  */ }
                <Button
                    variant='chip'
                    size='iconChip'
                    aria-label={ T(start ? 'Dashboard.Browser.Settings' : 'Dashboard.Browser.Home') }
                    onClick={ start ? () => { setSettings(true); } : onHome }
                    className='shrink-0'>

                    {
                        start ? <FiSettings size={ 16 } /> : <FiHome size={ 16 } />
                    }

                </Button>

            </div>

            {
                start &&
                (
                    <DashboardBrowserTabs
                        tabs={ tabs }
                        active={ active }
                        onPick={ onPickTab }
                        onClose={ onCloseTab }
                        onAdd={ onAddTab } />
                )
            }

            { /*
              * Real load progress from the WebView, on the toolbar's bottom edge where a browser puts
              * it. It only unmounts once the bar has actually reached the end, so a finished load
              * reads as finished rather than the bar vanishing mid-way.
              */ }
            <div className='relative h-0.5 shrink-0 overflow-hidden'>

                <AnimatePresence>

                    {
                        state !== undefined && state.loading &&
                        (
                            <motion.div
                                key='progress'
                                initial={ { opacity: 1 } }
                                exit={ { opacity: 0 } }
                                transition={ { duration: 0.25 } }
                                className='absolute inset-y-0 inset-s-0 bg-btn-primary'
                                style={ { width: `${ Math.max(state.progress, 6) }%` } } />
                        )
                    }

                </AnimatePresence>

            </div>

            { /*
              * One frame per tab, all stacked on the same rectangle and all measurable, with only the
              * one in front left visible. `invisible` rather than `hidden` on purpose: a frame with no
              * box reports no size, and both platforms position their view from that box — a tab
              * brought forward would have nowhere to paint. What actually keeps a background page off
              * the screen is the native hide inside `WebFrame`; this only stops the DOM underneath one
              * frame showing through another.
              */ }
            <div className='relative min-h-0 flex-1'>

                {
                    tabs.map((item) =>
                    {
                        const front = item.id === active;

                        // Not `enabled` for a tab showing its start screen: the view is hidden so the
                        // shortcuts underneath can be seen, but the address is left in place so the
                        // page is kept rather than closed.
                        const shown = front && !atBrowserStart(item);

                        return (
                            <WebFrame
                                key={ item.id }
                                url={ item.index < 0 ? '' : item.entries[item.index] }
                                label={ frameLabel(item.id) }
                                enabled={ enabled && shown }
                                desktop={ view === 'desktop' }
                                reload={ item.reload }
                                title={ T('Dashboard.Browser.Title') }
                                onFallback={ (value) => { setNotice((map) => new Map(map).set(item.id, value)); } }
                                className={ cn('absolute inset-0 overflow-hidden bg-base-1', front ? 'visible' : 'invisible') }>

                                {
                                    front && !shown ?
                                        (
                                            <DashboardBrowserStart
                                                explorer={ explorer }
                                                favorites={ favorites }
                                                visits={ visits }
                                                notice={ notice.get(item.id) ?? '' }
                                                onOpen={ onOpen }
                                                onFavoriteSave={ onFavoriteSave }
                                                onFavoriteRemove={ onFavoriteRemove } />
                                        ) :
                                        undefined
                                }

                            </WebFrame>
                        );
                    })
                }

            </div>

            { /*
              * Mounted inside the tab, unlike every other dialog in the app, because this one belongs
              * to the browser rather than to the wallet. It opens from the start screen only, where no
              * page is loaded and so no browser view is painted over the layout to cover it.
              */ }
            <AnimatePresence>

                {
                    settings &&
                    (
                        <DashboardBrowserSettings
                            key='browser-settings'
                            view={ view }
                            visits={ visits.length }
                            icons={ icons.count }
                            iconBytes={ icons.bytes }
                            onView={ onView }
                            onClear={ onClear }
                            onClearCache={ onClearCache }
                            onClose={ () => { setSettings(false); } } />
                    )
                }

            </AnimatePresence>

        </div>
    );
}
