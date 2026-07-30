import type { Network } from '../../core/network';

import { useEffect, useState } from 'react';
import { IoClose } from 'react-icons/io5';
import { FiArrowLeft, FiArrowRight, FiHome, FiRotateCw, FiSearch } from 'react-icons/fi';

import WebFrame from '../../layout/webview';

import { getDirection, T } from '../../utility/language';
import { getNativeBrowser, onNativeBrowserState, type BrowserState } from '../../core/browser';

/**
 * Label of the child webview that renders the page. Only ever one exists at a time.
 */
const frameLabel = 'nura-browser';

/**
 * Shortcuts shown on the browser start screen, next to the active network's explorer.
 */
const bookmarks: { name: string; url: string }[] =
[
    { name: 'Uniswap', url: 'https://app.uniswap.org' },
    { name: 'CoinGecko', url: 'https://www.coingecko.com' },
    { name: 'DeFiLlama', url: 'https://defillama.com' },
    { name: 'OpenSea', url: 'https://opensea.io' }
];

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
 * What lives here is the chrome around it: the toolbar, the start screen of shortcuts, and a history
 * stack kept in this component rather than the webview's own, since the child-webview API exposes no
 * `navigate` and every step is a fresh view.
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

    const isRtl = getDirection() === 'rtl';
    const current = index < 0 ? '' : entries[index];

    const native = getNativeBrowser() !== undefined;

    // The native view keeps its own history, so links followed inside a page are navigable too — the
    // component's stack only ever sees what was typed or handed over. Off Android there is no such
    // view and the stack is all there is.
    const canBack = native ? live?.canBack === true : index >= 0;
    const canForward = native ? live?.canForward === true : index < entries.length - 1;

    useEffect(() => onNativeBrowserState(setLive), []);

    // A page reached by following links is not on the stack, so its address has to come from the view.
    useEffect(() =>
    {
        if (live !== undefined && live.url.length > 0)
        {
            setDraft(live.url);
        }
    }, [ live?.url ]);

    const links = network.explorerUrl.length > 0 ?
        [ { name: T('Dashboard.Browser.Explorer'), url: `${ network.explorerUrl }/address/${ address }` }, ...bookmarks ] :
        bookmarks;

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
        const view = getNativeBrowser();

        if (view !== undefined)
        {
            if (offset < 0)
            {
                view.back();
            }
            else
            {
                view.forward();
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

    return (
        <div className='flex min-h-0 flex-1 flex-col'>

            { /* `base-1` is the 0.25-alpha token in both themes; `base-2` sits at 0.6/0.55 and read as solid. */ }
            <div className='border-glass-line bg-base-1 flex shrink-0 items-center gap-1.5 border-b p-2 backdrop-blur-xl'>

                <button
                    type='button'
                    aria-label={ T('Dashboard.Browser.Exit') }
                    onClick={ onExit }
                    className='chip-control flex size-9 shrink-0 items-center justify-center rounded-xl'>

                    <IoClose size={ 18 } />

                </button>

                <button
                    type='button'
                    disabled={ !canBack }
                    aria-label={ T('Dashboard.Browser.Back') }
                    onClick={ () => { onStep(-1); } }
                    className='chip-control flex size-9 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed! disabled:opacity-40'>

                    {
                        isRtl ? <FiArrowRight size={ 16 } /> : <FiArrowLeft size={ 16 } />
                    }

                </button>

                <button
                    type='button'
                    disabled={ !canForward }
                    aria-label={ T('Dashboard.Browser.Forward') }
                    onClick={ () => { onStep(1); } }
                    className='chip-control flex size-9 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed! disabled:opacity-40'>

                    {
                        isRtl ? <FiArrowLeft size={ 16 } /> : <FiArrowRight size={ 16 } />
                    }

                </button>

                <div className='relative flex min-w-0 flex-1 items-center'>

                    <FiSearch size={ 14 } className='text-txt-muted pointer-events-none absolute inset-s-2.5' />

                    <input
                        dir={ draft.length > 0 ? 'ltr' : undefined }
                        value={ draft }
                        placeholder={ T('Dashboard.Browser.Placeholder') }
                        onChange={ (event) => { setDraft(event.target.value); } }
                        onKeyDown={ (event) => { if (event.key === 'Enter') { onOpen(draft); } } }
                        className='glass-input text-tiny h-9 w-full truncate rounded-xl ps-8 pe-8' />

                    {
                        current.length > 0 &&
                        (
                            <button
                                type='button'
                                aria-label={ T('Dashboard.Browser.Reload') }
                                onClick={ () => { setCounter((value) => value + 1); } }
                                className='text-txt-muted absolute inset-e-2.5 cursor-pointer'>

                                <FiRotateCw size={ 14 } />

                            </button>
                        )
                    }

                </div>

                <button
                    type='button'
                    disabled={ current.length === 0 }
                    aria-label={ T('Dashboard.Browser.Home') }
                    onClick={ onHome }
                    className='chip-control flex size-9 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed! disabled:opacity-40'>

                    <FiHome size={ 16 } />

                </button>

            </div>

            <WebFrame
                url={ current }
                label={ frameLabel }
                enabled={ enabled }
                reload={ counter }
                title={ T('Dashboard.Browser.Title') }
                onFallback={ (value) => { setNotice(value); } }
                className='bg-base-1 min-h-0 flex-1 overflow-hidden'>

                <div className='flex size-full flex-col gap-3 overflow-y-auto p-4'>

                    <div className='text-tiny text-txt-muted'>

                        { T('Dashboard.Browser.Shortcuts') }

                    </div>

                    <div className='grid grid-cols-2 gap-2'>

                        {
                            links.map((item) => (
                                <button
                                    type='button'
                                    key={ item.url }
                                    onClick={ () => { onOpen(item.url); } }
                                    className='btn-muted flex h-14 items-center gap-2 rounded-xl px-3 text-start'>

                                    <div className='bg-btn-primary text-tiny text-txt-reverse flex size-8 shrink-0 items-center justify-center rounded-lg'>

                                        { item.name.slice(0, 1) }

                                    </div>

                                    <div className='text-small text-txt-normal flex-1 truncate'>

                                        { item.name }

                                    </div>

                                </button>
                            ))
                        }

                    </div>

                    {
                        notice.length > 0 &&
                        (
                            <div className='mt-auto flex flex-col gap-1'>

                                <div className='text-tiny text-txt-muted/70'>

                                    { T('Dashboard.Browser.Hint') }

                                </div>

                                <div dir='ltr' className='bg-txt-error/10 text-tiny text-txt-error rounded-lg px-2 py-1 text-start font-mono'>

                                    { notice }

                                </div>

                            </div>
                        )
                    }

                </div>

            </WebFrame>

        </div>
    );
}
