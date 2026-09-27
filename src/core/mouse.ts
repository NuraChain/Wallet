import { getValue, setValue } from '../utility/storage';

import { getNativeBrowser, mouseLabel } from './browser';

import type { MouseAction } from '../type/app';

declare global {
    interface Window {
        /** Where Android's native mouse reports a press. */
        __nuraMouse?: (action: MouseAction) => void;
    }
}

const mouseSize = 48;
const mouseEdge = 16;

export const defaultMouseOpacity = 0.25;

export const readMouseOpacity = (value: unknown) => {
    const opacity = Number(value);

    return Number.isFinite(opacity) && opacity >= 0.1 && opacity <= 1 ? opacity : defaultMouseOpacity;
};

let opacity = defaultMouseOpacity;
let loading: Promise<void> | undefined;

const listeners = new Set<() => void>();

const announce = () => {
    for (const listener of listeners) {
        listener();
    }
};

/** Reads the stored opacity once, the first time anything wants to show the mouse. */
const loadMouseOpacity = async () => {
    loading ??= getValue('App.Mouse')
        .catch(() => undefined)
        .then((stored) => {
            opacity = readMouseOpacity(stored);

            announce();
        });

    await loading;

    return opacity;
};

export const getMouseOpacity = () => opacity;

export const subscribeMouseOpacity = (listener: () => void) => {
    listeners.add(listener);

    void loadMouseOpacity();

    return () => {
        listeners.delete(listener);
    };
};

export const setMouseOpacity = async (value: number) => {
    opacity = value;

    announce();

    const bridge = getNativeBrowser();

    if (bridge === undefined) {
        try {
            const { emit } = await import('@tauri-apps/api/event');

            await emit('nura://mouse-opacity', value);
        } catch {
            // No desktop mouse to tell.
        }
    } else {
        bridge.setMouseOpacity?.(value);
    }

    await setValue('App.Mouse', String(value));
};

// Where the desktop mouse was left, so a lock and unlock put it back rather than in the corner.
let parked: { x: number; y: number } | undefined;

// Create and close run one at a time: a lock straight into an unlock would otherwise ask for the
// label while the old webview still holds it.
let chain = Promise.resolve();

const queue = (task: () => Promise<void>) => {
    chain = chain.then(task).catch(() => undefined);
};

const closeDesktop = async () => {
    const { Webview } = await import('@tauri-apps/api/webview');

    const view = await Webview.getByLabel(mouseLabel);

    if (view === null) {
        return;
    }

    const at = await view.position().catch(() => undefined);

    if (at !== undefined) {
        parked = { x: at.x / window.devicePixelRatio, y: at.y / window.devicePixelRatio };
    }

    await view.close();
};

const openDesktop = async () => {
    const { emit } = await import('@tauri-apps/api/event');
    const { Webview, getCurrentWebview } = await import('@tauri-apps/api/webview');
    const { getCurrentWindow } = await import('@tauri-apps/api/window');

    // The mouse's webview runs under this one's capability. Unless that lets it report a press and
    // move itself, a mouse drawn there could be seen and never used, so it is not drawn at all.
    await Promise.all([emit('nura://mouse-probe'), getCurrentWebview().position(), getCurrentWindow().innerSize()]);

    const clamp = (value: number, room: number) => Math.min(Math.max(value, 0), Math.max(room - mouseSize, 0));

    // The page is transparent, so the webview is only ever the logo; the fragment carries the
    // opacity because it never reaches the asset protocol the way a query would.
    const view = new Webview(getCurrentWindow(), mouseLabel, {
        url: `index.html#mouse=${await loadMouseOpacity()}`,
        x: clamp(parked?.x ?? window.innerWidth - mouseSize - mouseEdge, window.innerWidth),
        y: clamp(parked?.y ?? window.innerHeight * 0.7, window.innerHeight),
        width: mouseSize,
        height: mouseSize,
        transparent: true,
        focus: false,
        dragDropEnabled: false
    });

    // Settled before the queue moves on, so a close behind it finds the webview to close.
    await new Promise<void>((resolve, reject) => {
        void view.once('tauri://created', () => {
            resolve();
        });

        void view.once('tauri://error', (event) => {
            reject(new Error(String(event.payload)));
        });
    });
};

/**
 * Put the mouse above every layer — the wallet and any browser tab — until the returned cleanup
 * runs. A tab is an OS-level view no z-index reaches over, so the mouse is one too: a view Kotlin
 * keeps on top on Android, and its own transparent webview on desktop, re-raised by Rust whenever
 * a tab is added. Neither is reachable from a page: tabs hold no event permission, so nothing they
 * run can pose as a press. Where neither can be drawn, `onFallback` asks for the in-page mouse.
 */
export const showMouse = (onAction: (action: MouseAction) => void, onFallback: () => void) => {
    let live = true;

    const bridge = getNativeBrowser();

    if (bridge !== undefined) {
        if (bridge.showMouse === undefined) {
            onFallback();

            return () => undefined;
        }

        window.__nuraMouse = onAction;

        void loadMouseOpacity().then((value) => {
            if (live) {
                bridge.showMouse?.(value);
            }
        });

        return () => {
            live = false;

            window.__nuraMouse = undefined;

            bridge.hideMouse?.();
        };
    }

    let stop: (() => void) | undefined;

    queue(async () => {
        try {
            const { listen } = await import('@tauri-apps/api/event');

            const unlisten = await listen<unknown>('nura://mouse', (event) => {
                if (event.payload === 'click' || event.payload === 'double') {
                    onAction(event.payload);
                }
            });

            if (!live) {
                unlisten();

                return;
            }

            stop = unlisten;

            await closeDesktop();
            await openDesktop();
        } catch {
            stop?.();
            stop = undefined;

            if (live) {
                onFallback();
            }
        }
    });

    return () => {
        live = false;

        stop?.();

        queue(closeDesktop);
    };
};
