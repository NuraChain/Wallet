import type { Network } from '../../core/network';

import { useEffect, useState } from 'react';
import { IoClose } from 'react-icons/io5';
import { AnimatePresence, motion } from 'motion/react';
import { FiArrowLeft, FiArrowRight, FiHome, FiRotateCw, FiSearch, FiSettings } from 'react-icons/fi';

import WebFrame from '../../layout/webview';
import TokenIcon from '../token.icon';
import DashboardBrowserSettings from './dashboard.browser.settings';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import EmptyState from '../ui/state';
import SectionHeader from '../ui/section';
import { TextField } from '../ui/field';

import { T } from '../../utility/language';
import { addBrowserVisit, clearBrowserHistory, getBrowserHistory, getBrowserView, getNativeBrowser, getSiteHost, getSiteIcon, onNativeBrowserState, setBrowserView, suggestedSites, type BrowserState, type BrowserVisit, type BrowserView } from '../../core/browser';

/**
 * Label of the child webview that renders the page. Only ever one exists at a time.
 */
const frameLabel = 'nura-browser';

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
 * Two lists make up the start screen. The suggested sites are fixed and come from `core/browser`; the
 * visited ones are what this tab has opened before, persisted so they survive the tab being torn down
 * — which happens on every switch away, since the webview cannot be left painted over another tab.
 * Both are shortcuts, and neither is the in-session back stack the toolbar arrows walk.
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
    const [ index, setIndex ] = useState(-1);
    const [ draft, setDraft ] = useState('');
    const [ counter, setCounter ] = useState(0);
    const [ notice, setNotice ] = useState('');
    const [ entries, setEntries ] = useState<string[]>([]);
    const [ live, setLive ] = useState<BrowserState | undefined>(undefined);
    const [ settings, setSettings ] = useState(false);
    const [ view, setView ] = useState<BrowserView>('mobile');
    const [ visits, setVisits ] = useState<BrowserVisit[]>([]);

    const current = index < 0 ? '' : entries[index];

    const native = getNativeBrowser() !== undefined;

    // The native view keeps its own history, so links followed inside a page are navigable too — the
    // component's stack only ever sees what was typed or handed over. Off Android there is no such
    // view and the stack is all there is.
    const canBack = native ? live?.canBack === true : index >= 0;
    const canForward = native ? live?.canForward === true : index < entries.length - 1;

    useEffect(() => onNativeBrowserState(setLive), []);

    // Read once on mount rather than at module scope: this is the only surface that needs either
    // value, and a store read that fails here costs a start screen its shortcuts instead of leaving
    // the whole app unresolved the way the awaits in `app.tsx` do.
    useEffect(() =>
    {
        const load = async() =>
        {
            setView(await getBrowserView());
            setVisits(await getBrowserHistory());
        };

        void load();
    }, []);

    // A page reached by following links is not on the stack, so its address has to come from the view.
    useEffect(() =>
    {
        if (live !== undefined && live.url.length > 0)
        {
            setDraft(live.url);
        }
    }, [ live?.url ]);

    // The explorer entry is the one suggestion that is not a fixed address: it points at the active
    // network's explorer, on this account, so the row means something different on each chain — and
    // it drops out entirely on a network that declares none.
    const explorer = network.explorerUrl.length > 0 ? `${ network.explorerUrl }/address/${ address }` : '';

    const suggested = suggestedSites
        .map((item) =>
        {
            if (item.explorer)
            {
                return { name: T('Dashboard.Browser.Explorer'), url: explorer };
            }

            return { name: item.name, url: item.url };
        })
        .filter((item) => item.url.length > 0);

    const onOpen = (value: string) =>
    {
        const url = toUrl(value);

        if (url.length === 0)
        {
            return;
        }

        const next = [ ...entries.slice(0, index + 1), url ];

        setEntries(next);
        setIndex(next.length - 1);
        setDraft(url);
        setNotice('');

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
        const bridge = getNativeBrowser();

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

        const next = index + offset;

        if (next < 0 || next >= entries.length)
        {
            return;
        }

        setIndex(next);
        setDraft(entries[next]);
    };

    const onHome = () =>
    {
        setIndex(-1);
        setDraft('');
    };

    const onView = (chosen: BrowserView) =>
    {
        setView(chosen);

        void setBrowserView(chosen);
    };

    const onClear = () =>
    {
        setVisits([]);

        void clearBrowserHistory();
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
                        dir={ draft.length > 0 ? 'ltr' : undefined }
                        value={ draft }
                        placeholder={ T('Dashboard.Browser.Placeholder') }
                        onValue={ setDraft }
                        onEnter={ () => { onOpen(draft); } }
                        className='h-9 truncate rounded-xl ps-8 pe-8 text-tiny'
                        leading={ <FiSearch size={ 14 } className='pointer-events-none absolute inset-s-2.5 text-txt-muted' /> }
                        trailing={
                            current.length > 0 ?
                                (
                                    <Button
                                        aria-label={ T('Dashboard.Browser.Reload') }
                                        onClick={ () => { setCounter((value) => value + 1); } }
                                        className='absolute inset-e-2.5 cursor-pointer text-txt-muted'>

                                        { /* Spinning the reload glyph is the in-flight cue; it is the same
                                          * control either way, so nothing moves when the load ends. */ }
                                        <FiRotateCw size={ 14 } className={ live?.loading === true ? 'animate-spin' : '' } />

                                    </Button>
                                ) :
                                undefined
                        } />

                </div>

                <Button
                    variant='chip'
                    size='iconChip'
                    disabled={ current.length === 0 }
                    aria-label={ T('Dashboard.Browser.Home') }
                    onClick={ onHome }
                    className='shrink-0 disabled:opacity-40'>

                    <FiHome size={ 16 } />

                </Button>

            </div>

            { /*
              * Real load progress from the WebView, on the toolbar's bottom edge where a browser puts
              * it. It only unmounts once the bar has actually reached the end, so a finished load
              * reads as finished rather than the bar vanishing mid-way.
              */ }
            <div className='relative h-0.5 shrink-0 overflow-hidden'>

                <AnimatePresence>

                    {
                        live !== undefined && live.loading &&
                        (
                            <motion.div
                                key='progress'
                                initial={ { opacity: 1 } }
                                exit={ { opacity: 0 } }
                                transition={ { duration: 0.25 } }
                                className='absolute inset-y-0 inset-s-0 bg-btn-primary'
                                style={ { width: `${ Math.max(live.progress, 6) }%` } } />
                        )
                    }

                </AnimatePresence>

            </div>

            <WebFrame
                url={ current }
                label={ frameLabel }
                enabled={ enabled }
                desktop={ view === 'desktop' }
                reload={ counter }
                title={ T('Dashboard.Browser.Title') }
                onFallback={ (value) => { setNotice(value); } }
                className='min-h-0 flex-1 overflow-hidden bg-base-1'>

                <div className='flex size-full flex-col gap-3 overflow-y-auto p-4'>

                    <SectionHeader title={ T('Dashboard.Browser.Suggested') }>

                        <Button
                            variant='chip'
                            size='iconChip'
                            aria-label={ T('Dashboard.Browser.Settings') }
                            onClick={ () => { setSettings(true); } }>

                            <FiSettings size={ 16 } />

                        </Button>

                    </SectionHeader>

                    <div className='grid grid-cols-2 gap-2'>

                        {
                            suggested.map((item) => (
                                <Button
                                    key={ item.url }
                                    variant='muted'
                                    onClick={ () => { onOpen(item.url); } }
                                    className='h-14 gap-3 rounded-xl px-3 text-start'>

                                    { /*
                                      * The site's own icon, with its initial underneath for the ones
                                      * that answer with nothing — the same treatment a token gets in
                                      * the holdings list, and the same component drawing it.
                                      */ }
                                    <TokenIcon
                                        primary
                                        src={ getSiteIcon(item.url) }
                                        symbol={ item.name }
                                        className='size-8 text-tiny' />

                                    <Text
                                        variant='body'
                                        className='flex-1 truncate'
                                        text={ item.name } />

                                </Button>
                            ))
                        }

                    </div>

                    <SectionHeader title={ T('Dashboard.Browser.Recent') } />

                    {
                        visits.length === 0 ?
                            <EmptyState panel text={ T('Dashboard.Browser.RecentEmpty') } /> :
                            (
                                <div className='grid grid-cols-2 gap-2'>

                                    {
                                        visits.map((item) => (
                                            <Button
                                                key={ item.url }
                                                title={ item.url }
                                                variant='muted'
                                                onClick={ () => { onOpen(item.url); } }
                                                className='h-14 gap-3 rounded-xl px-3 text-start'>

                                                <TokenIcon
                                                    src={ getSiteIcon(item.url) }
                                                    symbol={ getSiteHost(item.url).toUpperCase() }
                                                    className='size-8 text-tiny' />

                                                { /*
                                                  * The host alone names the row, which is what makes two
                                                  * of these fit on a line. The full address used to sit
                                                  * under it and cannot survive half a row — it truncated
                                                  * to an ellipsis and took the host's width with it, so
                                                  * it moved to the tooltip. Left-to-right inside a column
                                                  * the interface may be running right-to-left, the same
                                                  * treatment the account switcher gives an address.
                                                  */ }
                                                <Text
                                                    variant='body'
                                                    className='flex-1 truncate'>

                                                    <span dir='ltr'>

                                                        { getSiteHost(item.url) }

                                                    </span>

                                                </Text>

                                            </Button>
                                        ))
                                    }

                                </div>
                            )
                    }

                    {
                        notice.length > 0 &&
                        (
                            <div className='mt-auto flex flex-col gap-1'>

                                <Text
                                    className='text-txt-muted/70'
                                    text={ T('Dashboard.Browser.Hint') } />

                                <Alert
                                    dir='ltr'
                                    variant='danger'
                                    className='px-2 py-1 text-start font-mono'
                                    text={ notice } />

                            </div>
                        )
                    }

                </div>

            </WebFrame>

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
                            onView={ onView }
                            onClear={ onClear }
                            onClose={ () => { setSettings(false); } } />
                    )
                }

            </AnimatePresence>

        </div>
    );
}
