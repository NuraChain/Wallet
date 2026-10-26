import { getPlatform } from '../utility/platform';
import { getValue, setValue } from '../utility/storage';

import { getNativeBrowser, mouseLabel } from './browser';

import type { Webview } from '@tauri-apps/api/webview';
import type { MouseIcon, Point } from '../type/app';

declare global {
    interface Window {
        /** Where a native mouse, Android's or iOS's, reports a press: `click`, with the mouse's centre in the wallet's page. */
        __nuraMouse?: (action: string, x?: number, y?: number) => void;
    }
}

const mouseSize = 40;

export const defaultMouseOpacity = 0.25;

export const readMouseOpacity = (value: unknown) => {
    const opacity = Number(value);

    return Number.isFinite(opacity) && opacity >= 0.1 && opacity <= 1 ? opacity : defaultMouseOpacity;
};

export const readMouseIcon = (value: unknown): MouseIcon => (value === 'browser' ? 'browser' : 'logo');

let opacity = defaultMouseOpacity;
let icon: MouseIcon = 'logo';
let loading: Promise<void> | undefined;

const listeners = new Set<() => void>();

const announce = () => {
    for (const listener of listeners) {
        listener();
    }
};

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

/** Also kept here so a mouse drawn later starts out right; the in-page mouse takes it as a prop instead. */
export const setMouseIcon = async (value: MouseIcon) => {
    icon = value;

    const bridge = getNativeBrowser();

    if (bridge !== undefined) {
        bridge.setMouseIcon?.(value);

        return;
    }

    try {
        const { emit } = await import('@tauri-apps/api/event');

        await emit('nura://mouse-icon', value);
    } catch {
        // No desktop mouse to tell.
    }
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

// Linux lays child webviews out itself, so the mouse is placed and read back through the commands that do it.
const placeOnLinux = async (x: number, y: number) => {
    const { invoke } = await import('@tauri-apps/api/core');

    await invoke('browser_place', { label: mouseLabel, x, y, width: mouseSize, height: mouseSize });
};

/** In physical pixels. */
export const getMousePosition = async (view: Webview): Promise<{ x: number; y: number }> => {
    if (getPlatform() !== 'linux') {
        const at = await view.position();

        return { x: at.x, y: at.y };
    }

    const { invoke } = await import('@tauri-apps/api/core');

    const at = await invoke<{ x: number; y: number }>('browser_position', { label: mouseLabel });

    return { x: at.x * window.devicePixelRatio, y: at.y * window.devicePixelRatio };
};

/** In physical pixels. */
export const setMousePosition = async (view: Webview, point: { x: number; y: number }) => {
    if (getPlatform() === 'linux') {
        await placeOnLinux(point.x / window.devicePixelRatio, point.y / window.devicePixelRatio);

        return;
    }

    const { PhysicalPosition } = await import('@tauri-apps/api/dpi');

    await view.setPosition(new PhysicalPosition(point.x, point.y));
};

// Where the mouse was left, so a lock and unlock put it back.
let parked: { x: number; y: number } | undefined;

// One at a time: an unlock straight after a lock would otherwise ask for a label the old webview still holds.
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

    const at = await getMousePosition(view).catch(() => undefined);

    if (at !== undefined) {
        parked = { x: at.x / window.devicePixelRatio, y: at.y / window.devicePixelRatio };
    }

    await view.close();
};

const openDesktop = async () => {
    const { emit } = await import('@tauri-apps/api/event');
    const { Webview, getCurrentWebview } = await import('@tauri-apps/api/webview');
    const { getCurrentWindow } = await import('@tauri-apps/api/window');

    // Drawn only if this capability lets the mouse's webview report a press and move itself.
    await Promise.all([emit('nura://mouse-probe'), getCurrentWebview().position(), getCurrentWindow().innerSize()]);

    const clamp = (value: number, room: number) => Math.min(Math.max(value, 0), Math.max(room - mouseSize, 0));

    const x = clamp(parked?.x ?? (window.innerWidth - mouseSize) / 2, window.innerWidth);
    const y = clamp(parked?.y ?? (window.innerHeight - mouseSize) / 2, window.innerHeight);

    // The fragment carries the start state because a query never reaches the asset protocol.
    const view = new Webview(getCurrentWindow(), mouseLabel, {
        url: `index.html#mouse=${await loadMouseOpacity()}&icon=${icon}`,
        x,
        y,
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

    // Linux ignores the position asked for above.
    if (getPlatform() === 'linux') {
        await placeOnLinux(x, y);
    }
};

// The mouse's webview is placed in the window, and the wallet's own fills it from the top corner.
const desktopCentre = async (): Promise<Point | undefined> => {
    try {
        const { Webview } = await import('@tauri-apps/api/webview');

        const view = await Webview.getByLabel(mouseLabel);

        if (view === null) {
            return undefined;
        }

        const at = await getMousePosition(view);

        return { x: at.x / window.devicePixelRatio + mouseSize / 2, y: at.y / window.devicePixelRatio + mouseSize / 2 };
    } catch {
        return undefined;
    }
};

/**
 * Puts the mouse above every layer, OS-level tabs included, until the cleanup runs; `onFallback` asks for the in-page one.
 * Tabs hold no event permission, so nothing a page runs can pose as a press.
 */
export const showMouse = (onPress: (at: Point | undefined) => void, onFallback: () => void) => {
    let live = true;

    const bridge = getNativeBrowser();

    if (bridge !== undefined) {
        if (bridge.showMouse === undefined) {
            onFallback();

            return () => undefined;
        }

        window.__nuraMouse = (action, x, y) => {
            if (action === 'click') {
                onPress(typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined);
            }
        };

        void loadMouseOpacity().then((value) => {
            if (live) {
                bridge.setMouseIcon?.(icon);
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
            const { emit, listen } = await import('@tauri-apps/api/event');

            const stops = await Promise.all([
                listen<unknown>('nura://mouse', (event) => {
                    if (event.payload === 'click') {
                        void desktopCentre().then(onPress);
                    }
                }),
                // Told what to wear once it is listening: a change sent while it was loading reached nobody.
                listen('nura://mouse-ready', () => {
                    void emit('nura://mouse-icon', icon).catch(() => undefined);
                })
            ]);

            const unlisten = () => {
                for (const item of stops) {
                    item();
                }
            };

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
