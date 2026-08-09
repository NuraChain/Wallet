import { Webview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import Text from '../components/ui/text';
import Spinner from '../components/ui/spinner';

import { T } from '../utility/language';
import { getNativeBrowser, getNativeTab, nativeHoldsTabs } from '../core/browser';
import { Vertical } from '../components/ui/stack';

/**
 * User agent the child webview presents.
 *
 * The window is phone-shaped, but WebView2 announces itself as desktop Windows, so sites served the
 * desktop layout into a 360px column. Claiming to be mobile Chrome is what makes them send the
 * layout that actually fits. Android needs none of this: its WebView already says `Mobile`.
 *
 * Kept close to a real Chrome-on-Android string, since sites sniff for the pieces rather than parse
 * the whole thing.
 */
const mobileAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

/**
 * User agent for the desktop view the browser's settings can switch to.
 *
 * The same string with the Android parts taken out and no `Mobile` token, which is the piece sites
 * actually branch on. It is what someone reaches for when a site's mobile layout hides the feature
 * they came for; the page arrives wide and the view is left to zoom, since the window is the width
 * it is either way.
 */
const desktopAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/**
 * How long the frame is followed after something that could have moved it, in animation frames.
 *
 * Long enough to outlast a tab slide, which runs for 350ms, and bounded so nothing is left running
 * once the frame has come to rest.
 */
const settleFrames = 90;

/**
 * WebFrame - A rectangle of the layout that a real browser view is painted into.
 *
 * Pages render in a child webview parented to the app window, not an iframe: most dApps and explorers
 * send `X-Frame-Options`/`frame-ancestors` and simply refuse to be framed, so an iframe stays blank on
 * exactly the sites this exists for. The child webview is an OS-level surface painted over the layout,
 * so it cannot simply be left alone when `enabled` goes false — it would cover the nav bar and any
 * open modal. Where child webviews are unavailable (Android, or a build without Tauri's `unstable`
 * feature) creation fails and the iframe is used as a degraded fallback.
 *
 * `enabled` hides the view; it does not discard it. Tearing it down was the obvious way to get it out
 * of the way, but the page went with it: switching to the wallet tab and back reloaded the site from
 * its address, losing the scroll position, anything typed into it and any state a dApp was holding —
 * and opening a modal over the browser did the same. The view now outlives both, and only a change of
 * `url`, an empty `url` or unmounting actually closes it.
 *
 * The webview has no `navigate` API, so a new `url` — or a bump of `reload` — recreates it.
 *
 * Because only one webview can own a label, every caller needs its own: two frames sharing one label
 * would tear down each other's view.
 * @param {object} props Component props.
 * @param {string} props.label Unique label for the child webview.
 * @param {string} props.url The page to show; an empty string renders `children` instead.
 * @param {boolean} props.enabled Whether the frame is on screen and allowed to own a webview.
 * @param {boolean} [props.desktop] Asks sites for the desktop layout instead of the mobile one.
 * @param {number} [props.reload] Bump to reload the current page.
 * @param {string} [props.title] Accessible title for the fallback iframe.
 * @param {string} [props.className] Classes for the frame element.
 * @param {ReactNode} [props.children] Rendered in place of the page whenever they are passed; the caller decides when the page area is covered.
 * @param {(notice: string) => void} [props.onFallback] Called with the failure reason when the native webview could not be created.
 * @returns {JSX.Element} The frame.
 */
export default function WebFrame({ label, url, enabled, desktop = false, reload = 0, title = '', className = '', children, onFallback }: { label: string; url: string; enabled: boolean; desktop?: boolean; reload?: number; title?: string; className?: string; children?: ReactNode; onFallback?: (notice: string) => void })
{
    const frameRef = useRef<HTMLDivElement>(null);
    const chainRef = useRef<Promise<void>>(Promise.resolve());

    // Creation deliberately does not re-run on `enabled`, so it cannot close over it and read anything
    // current. This is how the newly created view learns whether it is meant to be on screen.
    const enabledRef = useRef(enabled);

    const [ embedded, setEmbedded ] = useState(true);

    // An APK older than this bundle has no way to hide its view, and one older still can only hold a
    // single page — in both cases the frontmost tab is the only one allowed a view, and leaving takes
    // it down. `hides` and `nativeHoldsTabs()` are separate questions because they arrived separately.
    const nativeHides = getNativeTab(label)?.hides === true;
    const nativeTabs = nativeHoldsTabs();

    // Whether a view should exist at all, which is deliberately not the same question as whether it
    // should be on screen. Only the Android fallbacks above fold `enabled` back into it.
    const isLive = embedded && url.length > 0;
    const isNativeLive = url.length > 0 && (nativeHides || enabled) && (nativeTabs || enabled);

    useEffect(() =>
    {
        enabledRef.current = enabled;
    }, [ enabled ]);

    // A single failed creation should not strand the rest of the session on the iframe fallback.
    useEffect(() =>
    {
        setEmbedded(true);
    }, [ url ]);

    // Creation, teardown and visibility all address one webview by label, so they run in order — a
    // close still in flight from the previous URL would otherwise land after the new view was created
    // and kill it, and a `hide` can be asked for before the view it means to hide exists.
    const queue = useCallback((task: () => Promise<void>) =>
    {
        chainRef.current = chainRef.current.then(task, task);
    }, []);

    /**
     * Follows the frame for a moment and reports every rectangle it comes to rest at.
     *
     * The frame can be moved by something no observer will report. Opening a transaction from the wallet
     * hands the address over and *then* slides to the browser tab, and that slide is a CSS transform:
     * the frame ends up somewhere else without ever changing size, so `ResizeObserver` says nothing and
     * neither does `resize`. The view was therefore placed where the frame stood before the slide —
     * off screen — and stayed there, leaving the loading placeholder underneath it on display for good.
     *
     * Polling is the only way to see it. It is bounded, it only runs after something that could have
     * moved the frame, and it reports a rectangle only when it differs from the last one, so a frame
     * already at rest costs a comparison per frame and nothing else.
     * @param {(rect: DOMRect) => void} apply Receives each new rectangle.
     * @returns {() => void} Stops the watch early.
     */
    const settle = useCallback((apply: (rect: DOMRect) => void) =>
    {
        let stopped = false;
        let seen = 0;
        let last = '';

        const tick = () =>
        {
            if (stopped)
            {
                return;
            }

            const rect = frameRef.current?.getBoundingClientRect();

            if (rect !== undefined && rect.width >= 1 && rect.height >= 1)
            {
                const key = `${ rect.x },${ rect.y },${ rect.width },${ rect.height }`;

                if (key !== last)
                {
                    last = key;

                    apply(rect);
                }
            }

            seen += 1;

            if (seen < settleFrames)
            {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);

        return () => { stopped = true; };
    }, []);

    // Android: a real `android.webkit.WebView` driven from Kotlin. Tauri's child webview does not
    // exist on Android, and the iframe fallback is refused by anything sending `X-Frame-Options`.
    useEffect(() =>
    {
        const native = getNativeTab(label);

        if (native === undefined)
        {
            return undefined;
        }

        if (!isNativeLive)
        {
            native.close();

            return undefined;
        }

        // Told before the page is opened, so the first request already carries the agent the setting
        // asks for rather than loading once and reloading into it. The layout is one setting for the
        // whole browser, not a property of a tab, so it stays on the bridge itself.
        getNativeBrowser()?.setDesktop?.(desktop);

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

            // Read through the ref: this effect deliberately does not re-run on `enabled`, so the
            // value it closed over can be a tab switch out of date.
            native.open(url, enabledRef.current, next.x, next.y, next.width, next.height);
        };

        move();

        // The address can arrive before this tab is on screen — that is exactly what opening a
        // transaction from the wallet does — so the view is followed until the slide that brings the
        // frame into place has finished.
        const cancel = settle(move);

        const observer = new ResizeObserver(move);

        if (frameRef.current !== null)
        {
            observer.observe(frameRef.current);
        }

        window.addEventListener('resize', move);

        return () =>
        {
            cancel();

            observer.disconnect();

            window.removeEventListener('resize', move);

            native.close();
        };
    }, [ isNativeLive, label, url, desktop, settle ]);

    // Android visibility. The view is a sibling of the app's own webview rather than something drawn
    // inside it, so nothing in the layout can cover it — leaving the tab, switching to another one or
    // opening a modal has to say so explicitly. Bounds are left where they were, which is what makes
    // coming back instant.
    useEffect(() =>
    {
        const native = getNativeTab(label);

        if (native === undefined)
        {
            return undefined;
        }

        native.setVisible(enabled);

        if (!enabled)
        {
            return undefined;
        }

        // Becoming visible almost always means the tab has just slid in, and where it came to rest is
        // not where it was when the page was opened.
        return settle((rect) => { native.setBounds(rect.x, rect.y, rect.width, rect.height); });
    }, [ enabled, isNativeLive, label, settle ]);

    // A `reload` bump recreates the desktop child webview, but the native view is long-lived and has
    // a real reload of its own.
    useEffect(() =>
    {
        if (reload > 0)
        {
            getNativeTab(label)?.reload();
        }
    }, [ reload, label ]);

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

        // The frame is not always measurable on the first pass — the effect can run before layout has
        // settled. Giving up there left the page never opening and the placeholder up for good, which
        // is what made the tab stick on "loading"; the Android path above already waited for a usable
        // rectangle, and this one now does the same instead of returning on the first miss.
        const measure = async() =>
        {
            for (let attempt = 0; attempt < 40; attempt += 1)
            {
                const rect = frameRef.current?.getBoundingClientRect();

                if (rect !== undefined && rect.width >= 1 && rect.height >= 1)
                {
                    return rect;
                }

                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => { setTimeout(resolve, 50); });
            }

            return undefined;
        };

        const create = async() =>
        {
            const rect = await measure();

            if (rect === undefined)
            {
                onFallback?.('the browser frame never reported a usable size');

                return;
            }

            let failure = '';

            try
            {
                const view = new Webview(getCurrentWindow(), label, { url, x: rect.x, y: rect.y, width: rect.width, height: rect.height, focus: false, userAgent: desktop ? desktopAgent : mobileAgent });

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
                const view = await Webview.getByLabel(label);

                if (view !== null)
                {
                    // A webview is born visible and there is no option to create it otherwise, so a
                    // page opened from somewhere else — an activity row handing over a link — would
                    // flash over the tab being left before the visibility pass below caught up.
                    if (!enabledRef.current)
                    {
                        // eslint-disable-next-line no-await-in-loop
                        await view.hide();
                    }

                    return;
                }
            }

            setEmbedded(false);

            onFallback?.(failure.length > 0 ? failure : 'child webview was never created');
        };

        if (!isLive)
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
    }, [ isLive, label, url, reload, desktop, queue ]);

    // Desktop visibility. Queued behind creation for the same reason everything else is: asking a
    // webview that does not exist yet to hide would do nothing and leave it to appear over the modal
    // that wanted it gone.
    useEffect(() =>
    {
        if (!isLive || getNativeBrowser() !== undefined)
        {
            return undefined;
        }

        queue(async() =>
        {
            try
            {
                const view = await Webview.getByLabel(label);

                if (view === null)
                {
                    return;
                }

                await (enabled ? view.show() : view.hide());
            }
            catch
            {
                // the webview can be closing while a visibility change lands
            }
        });

        return undefined;
    }, [ isLive, enabled, label, url, reload, queue ]);

    useEffect(() =>
    {
        if (!isLive || getNativeBrowser() !== undefined)
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

        // Runs on every change of `enabled` as well, because a tab sliding into place moves the frame
        // without resizing it and this is the only thing that notices.
        const cancel = settle(() => { sync(); });

        return () =>
        {
            cancel();

            observer.disconnect();

            window.removeEventListener('resize', sync);
        };
    }, [ isLive, enabled, label, settle ]);

    return (
        <div
            ref={ frameRef }
            className={ className }>

            { /*
              * Children cover the page area when the caller passes them, and the caller decides when
              * that is — a tab with no address, or the start screen laid over a page that is being
              * kept alive behind it. What hides the page itself is the native hide, since the view is
              * painted over the layout and no amount of DOM will cover it; this only decides what is
              * underneath. The iframe fallback is the one path that does not survive being covered,
              * which is the degraded path already.
              */ }
            {
                children !== undefined && children
            }

            {
                children === undefined && url.length > 0 && !embedded &&
                (
                    <iframe
                        key={ `${ url }-${ reload }` }
                        src={ url }
                        title={ title.length > 0 ? title : T('Dashboard.Browser.Title') }
                        referrerPolicy='no-referrer'
                        sandbox='allow-scripts allow-forms allow-popups allow-same-origin'
                        className='size-full border-0 bg-base-1' />
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
                children === undefined && url.length > 0 && embedded && getNativeBrowser() === undefined &&
                (
                    <Vertical className='size-full items-center justify-center gap-3 text-tiny text-txt-muted'>

                        <Spinner size={ 22 } />

                        <Text text={ T('Dashboard.Browser.Loading') } />

                        <span className='relative h-0.5 w-32 overflow-hidden rounded-full bg-base-3'>

                            <motion.span
                                animate={ { x: [ '-100%', '220%' ] } }
                                transition={ { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } }
                                className='absolute inset-y-0 w-1/2 rounded-full bg-btn-primary' />

                        </span>

                    </Vertical>
                )
            }

        </div>
    );
}
