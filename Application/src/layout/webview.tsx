import { Webview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { motion } from 'motion/react';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { T } from '../utility/language';
import { getNativeBrowser } from '../core/browser';

/**
 * WebFrame - A rectangle of the layout that a real browser view is painted into.
 *
 * Pages render in a child webview parented to the app window, not an iframe: most dApps and explorers
 * send `X-Frame-Options`/`frame-ancestors` and simply refuse to be framed, so an iframe stays blank on
 * exactly the sites this exists for. The child webview is an OS-level surface painted over the layout,
 * which is why it is torn down the moment `enabled` goes false — otherwise it would cover the nav bar
 * and any open modal. Where child webviews are unavailable (Android, or a build without Tauri's
 * `unstable` feature) creation fails and the iframe is used as a degraded fallback.
 *
 * The webview has no `navigate` API, so a new `url` — or a bump of `reload` — recreates it.
 *
 * Because only one webview can own a label, every caller needs its own: two frames sharing one label
 * would tear down each other's view.
 * @param {object} props Component props.
 * @param {string} props.label Unique label for the child webview.
 * @param {string} props.url The page to show; an empty string renders `children` instead.
 * @param {boolean} props.enabled Whether the frame is on screen and allowed to own a webview.
 * @param {number} [props.reload] Bump to reload the current page.
 * @param {string} [props.title] Accessible title for the fallback iframe.
 * @param {string} [props.className] Classes for the frame element.
 * @param {ReactNode} [props.children] Rendered in place of the page while `url` is empty.
 * @param {(notice: string) => void} [props.onFallback] Called with the failure reason when the native webview could not be created.
 * @returns {JSX.Element} The frame.
 */
export default function WebFrame({ label, url, enabled, reload = 0, title = '', className = '', children, onFallback }: { label: string; url: string; enabled: boolean; reload?: number; title?: string; className?: string; children?: ReactNode; onFallback?: (notice: string) => void })
{
    const frameRef = useRef<HTMLDivElement>(null);
    const chainRef = useRef<Promise<void>>(Promise.resolve());

    const [ embedded, setEmbedded ] = useState(true);

    const isNative = embedded && enabled && url.length > 0;

    // A single failed creation should not strand the rest of the session on the iframe fallback.
    useEffect(() =>
    {
        setEmbedded(true);
    }, [ url ]);

    // Android: a real `android.webkit.WebView` driven from Kotlin. Tauri's child webview does not
    // exist on Android, and the iframe fallback is refused by anything sending `X-Frame-Options`.
    useEffect(() =>
    {
        const native = getNativeBrowser();

        if (native === undefined)
        {
            return undefined;
        }

        if (!enabled || url.length === 0)
        {
            native.close();

            return undefined;
        }

        let opened = false;

        // The frame is not always measurable on the first pass — switching to this tab runs the effect
        // before layout settles. Giving up there left the page never opening and the placeholder up
        // for good, which is what made the browser stick on "loading" now and again. So the same
        // callback both opens on the first usable rectangle and moves the view afterwards; routing
        // moves through `open` instead would reload the page on every keyboard or nav-bar change.
        const move = () =>
        {
            const next = frameRef.current?.getBoundingClientRect();

            if (next === undefined || next.width < 1 || next.height < 1)
            {
                return;
            }

            if (opened)
            {
                native.setBounds(next.x, next.y, next.width, next.height);

                return;
            }

            opened = true;

            native.open(url, next.x, next.y, next.width, next.height);
        };

        move();

        const observer = new ResizeObserver(move);

        if (frameRef.current !== null)
        {
            observer.observe(frameRef.current);
        }

        window.addEventListener('resize', move);

        return () =>
        {
            observer.disconnect();

            window.removeEventListener('resize', move);

            native.close();
        };
    }, [ enabled, url ]);

    // A `reload` bump recreates the desktop child webview, but the native view is long-lived and has
    // a real reload of its own.
    useEffect(() =>
    {
        if (reload > 0)
        {
            getNativeBrowser()?.reload();
        }
    }, [ reload ]);

    useEffect(() =>
    {
        if (getNativeBrowser() !== undefined)
        {
            return undefined;
        }

        const destroy = async() =>
        {
            try
            {
                const view = await Webview.getByLabel(label);

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
                const view = new Webview(getCurrentWindow(), label, { url, x: rect.x, y: rect.y, width: rect.width, height: rect.height, focus: false });

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
                if (await Webview.getByLabel(label) !== null)
                {
                    return;
                }
            }

            setEmbedded(false);

            onFallback?.(failure.length > 0 ? failure : 'child webview was never created');
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
    }, [ isNative, label, url, reload ]);

    useEffect(() =>
    {
        if (!isNative || getNativeBrowser() !== undefined)
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
                    const view = await Webview.getByLabel(label);

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
    }, [ isNative, label ]);

    return (
        <div
            ref={ frameRef }
            className={ className }>

            {
                url.length === 0 && children
            }

            {
                url.length > 0 && !embedded &&
                (
                    <iframe
                        key={ `${ url }-${ reload }` }
                        src={ url }
                        title={ title.length > 0 ? title : T('Dashboard.Browser.Title') }
                        referrerPolicy='no-referrer'
                        sandbox='allow-scripts allow-forms allow-popups allow-same-origin'
                        className='bg-base-1 size-full border-0' />
                )
            }

            {
                // Only the desktop child-webview path has a gap to fill; the native Android view paints
                // its own surface, and leaving this mounted behind it is what stranded the tab on
                // "loading" whenever that view failed to open.
                //
                // The child webview reports no progress, so the indicator is deliberately
                // indeterminate: a spinner and a sweeping bar that say work is happening without
                // implying a position. It sat here as motionless text before, which reads as a hang.
                url.length > 0 && embedded && getNativeBrowser() === undefined &&
                (
                    <div className='text-tiny text-txt-muted flex size-full flex-col items-center justify-center gap-3'>

                        <AiOutlineLoading3Quarters size={ 22 } className='animate-spin' />

                        <span>

                            { T('Dashboard.Browser.Loading') }

                        </span>

                        <span className='bg-base-3 relative h-0.5 w-32 overflow-hidden rounded-full'>

                            <motion.span
                                animate={ { x: [ '-100%', '220%' ] } }
                                transition={ { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } }
                                className='bg-btn-primary absolute inset-y-0 w-1/2 rounded-full' />

                        </span>

                    </div>
                )
            }

        </div>
    );
}
