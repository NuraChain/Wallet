import { invoke } from '@tauri-apps/api/core';
import { Webview } from '@tauri-apps/api/webview';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import Text from '../components/ui/text';
import Spinner from '../components/ui/spinner';
import ProgressBar from '../components/ui/progress';

import { T } from '../utility/language';
import { getNativeBrowser, getNativeTab, nativeHoldsTabs } from '../core/browser';
import { Vertical } from '../components/ui/stack';

const mobileAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const desktopAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const settleFrames = 90;

export default function WebFrame({
    label,
    url,
    enabled,
    desktop = false,
    reload = 0,
    title = '',
    script = '',
    className = '',
    children,
    onFallback
}: {
    label: string;
    url: string;
    enabled: boolean;
    desktop?: boolean;
    reload?: number;
    title?: string;
    script?: string;
    className?: string;
    children?: ReactNode;
    onFallback?: (notice: string) => void;
}) {
    const frameRef = useRef<HTMLDivElement>(null);
    const chainRef = useRef<Promise<void>>(Promise.resolve());

    const scriptRef = useRef(script);

    const enabledRef = useRef(enabled);

    const placeRef = useRef<DOMRect>(undefined);
    const placingRef = useRef(false);

    const [embedded, setEmbedded] = useState(true);

    const nativeHides = getNativeTab(label)?.hides === true;
    const nativeTabs = nativeHoldsTabs();

    const isLive = embedded && url.length > 0;
    const isNativeLive = url.length > 0 && (nativeHides || enabled) && (nativeTabs || enabled);

    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
        scriptRef.current = script;
    }, [script]);

    useEffect(() => {
        setEmbedded(true);
    }, [url]);

    const queue = useCallback((task: () => Promise<void>) => {
        chainRef.current = chainRef.current.then(task, task);
    }, []);

    const place = useCallback(
        (rect: DOMRect) => {
            placeRef.current = rect;

            if (placingRef.current) {
                return;
            }

            placingRef.current = true;

            queue(async () => {
                placingRef.current = false;

                const target = placeRef.current;

                if (target === undefined) {
                    return;
                }

                try {
                    const view = await Webview.getByLabel(label);

                    if (view !== null) {
                        await view.setPosition(new LogicalPosition(target.x, target.y));
                        await view.setSize(new LogicalSize(target.width, target.height));
                    }
                } catch {}
            });
        },
        [label, queue]
    );

    const settle = useCallback((apply: (rect: DOMRect) => void) => {
        let stopped = false;
        let seen = 0;
        let last = '';

        const tick = () => {
            if (stopped) {
                return;
            }

            const rect = frameRef.current?.getBoundingClientRect();

            if (rect !== undefined && rect.width >= 1 && rect.height >= 1) {
                const key = `${rect.x},${rect.y},${rect.width},${rect.height}`;

                if (key !== last) {
                    last = key;

                    apply(rect);
                }
            }

            seen += 1;

            if (seen < settleFrames) {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);

        return () => {
            stopped = true;
        };
    }, []);

    useEffect(() => {
        const native = getNativeTab(label);

        if (native === undefined) {
            return undefined;
        }

        if (!isNativeLive) {
            native.close();

            return undefined;
        }

        getNativeBrowser()?.setDesktop?.(desktop);

        let opened = false;

        const move = () => {
            const next = frameRef.current?.getBoundingClientRect();

            if (next === undefined || next.width < 1 || next.height < 1) {
                return;
            }

            if (opened) {
                native.setBounds(next.x, next.y, next.width, next.height);

                return;
            }

            opened = true;

            native.open(url, enabledRef.current, next.x, next.y, next.width, next.height);
        };

        move();

        const cancel = settle(move);

        const observer = new ResizeObserver(move);

        if (frameRef.current !== null) {
            observer.observe(frameRef.current);
        }

        window.addEventListener('resize', move);

        return () => {
            cancel();

            observer.disconnect();

            window.removeEventListener('resize', move);

            native.close();
        };
    }, [isNativeLive, label, url, desktop, settle]);

    useEffect(() => {
        const native = getNativeTab(label);

        if (native === undefined) {
            return undefined;
        }

        native.setVisible(enabled);

        if (!enabled) {
            return undefined;
        }

        return settle((rect) => {
            native.setBounds(rect.x, rect.y, rect.width, rect.height);
        });
    }, [enabled, isNativeLive, label, settle]);

    useEffect(() => {
        if (reload > 0) {
            getNativeTab(label)?.reload();
        }
    }, [reload, label]);

    useEffect(() => {
        if (getNativeBrowser() !== undefined) {
            return undefined;
        }

        const destroy = async () => {
            try {
                const view = await Webview.getByLabel(label);

                await view?.close();
            } catch {}
        };

        const measure = async () => {
            for (let attempt = 0; attempt < 40; attempt += 1) {
                const rect = frameRef.current?.getBoundingClientRect();

                if (rect !== undefined && rect.width >= 1 && rect.height >= 1) {
                    return rect;
                }

                // oxlint-disable-next-line no-await-in-loop
                await new Promise((resolve) => {
                    setTimeout(resolve, 50);
                });
            }

            return undefined;
        };

        const create = async () => {
            const rect = await measure();

            if (rect === undefined) {
                onFallback?.('the browser frame never reported a usable size');

                return;
            }

            let failure = '';

            try {
                await invoke('browser_open', {
                    label,
                    url,
                    script: scriptRef.current,
                    userAgent: desktop ? desktopAgent : mobileAgent,
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                });
            } catch (cause) {
                failure = cause instanceof Error ? cause.message : String(cause);
            }

            for (let attempt = 0; attempt < 20 && failure.length === 0; attempt += 1) {
                // oxlint-disable-next-line no-await-in-loop
                await new Promise((resolve) => {
                    setTimeout(resolve, 100);
                });

                // oxlint-disable-next-line no-await-in-loop
                const view = await Webview.getByLabel(label);

                if (view !== null) {
                    if (!enabledRef.current) {
                        // oxlint-disable-next-line no-await-in-loop
                        await view.hide();
                    }

                    const settled = frameRef.current?.getBoundingClientRect();

                    if (settled !== undefined && settled.width >= 1 && settled.height >= 1) {
                        // oxlint-disable-next-line no-await-in-loop
                        await view.setPosition(new LogicalPosition(settled.x, settled.y));

                        // oxlint-disable-next-line no-await-in-loop
                        await view.setSize(new LogicalSize(settled.width, settled.height));
                    }

                    return;
                }
            }

            setEmbedded(false);

            onFallback?.(failure.length > 0 ? failure : 'child webview was never created');
        };

        if (!isLive) {
            queue(destroy);

            return undefined;
        }

        queue(async () => {
            await destroy();
            await create();
        });

        return () => {
            queue(destroy);
        };
    }, [isLive, label, url, reload, desktop, queue]);

    useEffect(() => {
        if (!isLive || getNativeBrowser() !== undefined) {
            return undefined;
        }

        queue(async () => {
            try {
                const view = await Webview.getByLabel(label);

                if (view === null) {
                    return;
                }

                await (enabled ? view.show() : view.hide());
            } catch {}
        });

        return undefined;
    }, [isLive, enabled, label, url, reload, queue]);

    useEffect(() => {
        if (!isLive || getNativeBrowser() !== undefined) {
            return undefined;
        }

        const sync = () => {
            const rect = frameRef.current?.getBoundingClientRect();

            if (rect === undefined || rect.width < 1 || rect.height < 1) {
                return;
            }

            place(rect);
        };

        const observer = new ResizeObserver(sync);

        if (frameRef.current !== null) {
            observer.observe(frameRef.current);
        }

        window.addEventListener('resize', sync);

        const cancel = settle(() => {
            sync();
        });

        return () => {
            cancel();

            observer.disconnect();

            window.removeEventListener('resize', sync);
        };
    }, [isLive, enabled, place, settle]);

    return (
        <div ref={frameRef} className={className}>
            {children !== undefined && children}

            {children === undefined && url.length > 0 && !embedded && (
                <iframe
                    key={`${url}-${reload}`}
                    src={url}
                    title={title.length > 0 ? title : T('Dashboard.Browser.Title')}
                    referrerPolicy='no-referrer'
                    sandbox='allow-scripts allow-forms allow-popups allow-same-origin'
                    className='size-full border-0 bg-base-1'
                />
            )}

            {children === undefined && url.length > 0 && embedded && getNativeBrowser() === undefined && (
                <Vertical className='size-full items-center justify-center gap-3 text-tiny text-txt-muted'>
                    <Spinner size={22} />

                    <Text text={T('Dashboard.Browser.Loading')} />

                    <ProgressBar label={T('Dashboard.Browser.Loading')} className='w-32 rounded-full bg-base-3' />
                </Vertical>
            )}
        </div>
    );
}
