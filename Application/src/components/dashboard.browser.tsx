import type { Network } from '../core/network';

import { Webview } from '@tauri-apps/api/webview';
import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { FiArrowLeft, FiArrowRight, FiHome, FiRotateCw, FiSearch } from 'react-icons/fi';

import { getDirection, T } from '../utility/language';

/**
 * Label of the child webview that renders the page. Only ever one exists at a time.
 */
const frameLabel = 'gwallet-browser';

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
 * Pages render in a real child webview parented to the app window, not an iframe: most dApps send
 * `X-Frame-Options`/`frame-ancestors` and simply refuse to be framed, so an iframe stays blank on
 * exactly the sites this tab exists for. The child webview is an OS-level surface painted over the
 * panel, which is why it is torn down whenever the tab is not the visible one — otherwise it would
 * cover the nav bar and any open modal. Where child webviews are unavailable (Android, or a build
 * without Tauri's `unstable` feature) creation fails and the iframe is used as a degraded fallback.
 *
 * Back/forward walk a history stack kept here rather than the webview's own, and navigation
 * recreates the webview because the child-webview API exposes no `navigate`.
 * @param {object} props Component props.
 * @param {string} props.address The account address, used for the explorer shortcut.
 * @param {Network} props.network The active network.
 * @param {boolean} props.enabled Whether this tab is the visible one and no modal is open.
 * @returns {JSX.Element} The browser tab.
 */
export default function DashboardBrowser({ address, network, enabled }: { address: string; network: Network; enabled: boolean })
{
    const frameRef = useRef<HTMLDivElement>(null);
    const chainRef = useRef<Promise<void>>(Promise.resolve());

    const [ index, setIndex ] = useState(-1);
    const [ draft, setDraft ] = useState('');
    const [ counter, setCounter ] = useState(0);
    const [ notice, setNotice ] = useState('');
    const [ entries, setEntries ] = useState<string[]>([]);
    const [ embedded, setEmbedded ] = useState(true);

    const isRtl = getDirection() === 'rtl';
    const current = index < 0 ? '' : entries[index];
    const isNative = embedded && enabled && current.length > 0;

    const links = network.explorerUrl.length > 0 ?
        [ { name: T('Dashboard.Browser.Explorer'), url: `${ network.explorerUrl }/address/${ address }` }, ...bookmarks ] :
        bookmarks;

    useEffect(() =>
    {
        const destroy = async() =>
        {
            try
            {
                const view = await Webview.getByLabel(frameLabel);

                await view?.close();
            }
            catch
            {
                // a webview that is already gone is not a failure worth surfacing
            }
        };

        const create = async() =>
        {
            const rect = frameRef.current?.getBoundingClientRect();

            if (rect === undefined || rect.width < 1 || rect.height < 1)
            {
                return;
            }

            let failure = '';

            try
            {
                const view = new Webview(getCurrentWindow(), frameLabel, { url: current, x: rect.x, y: rect.y, width: rect.width, height: rect.height, focus: false });

                void view.once('tauri://error', (event) => { failure = String(event.payload); });
            }
            catch (cause)
            {
                failure = cause instanceof Error ? cause.message : String(cause);
            }

            // The creation ack can land before `once` finishes registering, so success is confirmed by
            // looking the webview up rather than by waiting on the event.
            for (let attempt = 0; attempt < 20 && failure.length === 0; attempt += 1)
            {
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => { setTimeout(resolve, 100); });

                // eslint-disable-next-line no-await-in-loop
                if (await Webview.getByLabel(frameLabel) !== null)
                {
                    return;
                }
            }

            setEmbedded(false);
            setNotice(failure.length > 0 ? failure : 'child webview was never created');
        };

        // Creation and teardown share one label, so they are serialized — otherwise a close still in
        // flight from the previous URL would land after the new webview was created and kill it.
        const queue = (task: () => Promise<void>) =>
        {
            chainRef.current = chainRef.current.then(task, task);
        };

        if (!isNative)
        {
            queue(destroy);

            return undefined;
        }

        queue(async() =>
        {
            await destroy();
            await create();
        });

        return () => { queue(destroy); };
    }, [ isNative, current, counter ]);

    useEffect(() =>
    {
        if (!isNative)
        {
            return undefined;
        }

        const sync = () =>
        {
            const rect = frameRef.current?.getBoundingClientRect();

            if (rect === undefined)
            {
                return;
            }

            const apply = async() =>
            {
                try
                {
                    const view = await Webview.getByLabel(frameLabel);

                    if (view !== null)
                    {
                        await view.setPosition(new LogicalPosition(rect.x, rect.y));
                        await view.setSize(new LogicalSize(rect.width, rect.height));
                    }
                }
                catch
                {
                    // the webview can be closing while a resize lands
                }
            };

            void apply();
        };

        const observer = new ResizeObserver(sync);

        if (frameRef.current !== null)
        {
            observer.observe(frameRef.current);
        }

        window.addEventListener('resize', sync);

        return () =>
        {
            observer.disconnect();

            window.removeEventListener('resize', sync);
        };
    }, [ isNative ]);

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

        // A single failed creation should not strand the rest of the session on the iframe fallback.
        setEmbedded(true);
        setNotice('');
    };

    const onStep = (offset: number) =>
    {
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
        <div className='flex min-h-0 flex-1 flex-col gap-3'>

            <div className='flex items-center gap-2'>

                <button
                    type='button'
                    disabled={ index < 0 }
                    aria-label={ T('Dashboard.Browser.Back') }
                    onClick={ () => { onStep(-1); } }
                    className='btn-muted flex size-10 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed! disabled:opacity-40'>

                    {
                        isRtl ? <FiArrowRight size={ 18 } /> : <FiArrowLeft size={ 18 } />
                    }

                </button>

                <button
                    type='button'
                    disabled={ index >= entries.length - 1 }
                    aria-label={ T('Dashboard.Browser.Forward') }
                    onClick={ () => { onStep(1); } }
                    className='btn-muted flex size-10 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed! disabled:opacity-40'>

                    {
                        isRtl ? <FiArrowLeft size={ 18 } /> : <FiArrowRight size={ 18 } />
                    }

                </button>

                <div className='relative flex flex-1 items-center'>

                    <FiSearch size={ 16 } className='pointer-events-none absolute inset-s-3 text-txt-muted' />

                    <input
                        dir={ draft.length > 0 ? 'ltr' : undefined }
                        value={ draft }
                        placeholder={ T('Dashboard.Browser.Placeholder') }
                        onChange={ (event) => { setDraft(event.target.value); } }
                        onKeyDown={ (event) => { if (event.key === 'Enter') { onOpen(draft); } } }
                        className='glass-input h-10 w-full rounded-xl ps-9 pe-10 text-small' />

                    {
                        current.length > 0 &&
                        (
                            <button
                                type='button'
                                aria-label={ T('Dashboard.Browser.Home') }
                                onClick={ onHome }
                                className='absolute inset-e-3 text-txt-muted'>

                                <FiHome size={ 16 } />

                            </button>
                        )
                    }

                </div>

                <button
                    type='button'
                    disabled={ current.length === 0 }
                    aria-label={ T('Dashboard.Browser.Reload') }
                    onClick={ () => { setCounter((value) => value + 1); } }
                    className='btn-muted flex size-10 shrink-0 items-center justify-center rounded-xl disabled:cursor-not-allowed! disabled:opacity-40'>

                    <FiRotateCw size={ 18 } />

                </button>

            </div>

            <div
                ref={ frameRef }
                className='glass-panel min-h-0 flex-1 overflow-hidden rounded-2xl'>

                {
                    current.length === 0 &&
                    (
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

                                            <div className='flex size-8 shrink-0 items-center justify-center rounded-full bg-btn-primary text-tiny text-txt-reverse'>

                                                { item.name.slice(0, 1) }

                                            </div>

                                            <div className='flex-1 truncate text-small text-txt-normal'>

                                                { item.name }

                                            </div>

                                        </button>
                                    ))
                                }

                            </div>

                            {
                                !embedded &&
                                (
                                    <div className='mt-auto flex flex-col gap-1'>

                                        <div className='text-tiny text-txt-muted/70'>

                                            { T('Dashboard.Browser.Hint') }

                                        </div>

                                        {
                                            notice.length > 0 &&
                                            (
                                                <div dir='ltr' className='rounded-lg bg-txt-error/10 px-2 py-1 text-start font-mono text-tiny text-txt-error'>

                                                    { notice }

                                                </div>
                                            )
                                        }

                                    </div>
                                )
                            }

                        </div>
                    )
                }

                {
                    current.length > 0 && !embedded &&
                    (
                        <iframe
                            key={ `${ current }-${ counter }` }
                            src={ current }
                            title={ T('Dashboard.Browser.Title') }
                            referrerPolicy='no-referrer'
                            sandbox='allow-scripts allow-forms allow-popups allow-same-origin'
                            className='size-full border-0 bg-base-1' />
                    )
                }

                {
                    current.length > 0 && embedded &&
                    (
                        <div className='flex size-full items-center justify-center text-tiny text-txt-muted'>

                            { T('Dashboard.Browser.Loading') }

                        </div>
                    )
                }

            </div>

        </div>
    );
}
