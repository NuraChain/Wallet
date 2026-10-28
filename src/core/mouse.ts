import { getPlatform } from '../utility/platform';
import { getTheme } from '../utility/theme';
import { getValue, setValue } from '../utility/storage';

import { getNativeBrowser, mouseLabel, mouseMenuLabel } from './browser';

import type { Webview } from '@tauri-apps/api/webview';
import type { MouseGlyph, MouseIcon, MouseMenuColors, MouseMenuItem, Point } from '../type/app';

declare global {
    interface Window {
        /**
         * Where a native mouse, Android's or iOS's, reports to the wallet: `click` with the mouse's centre in the
         * wallet's page, `move` as a drag starts, and `pick` with the key of the menu button pressed.
         */
        __nuraMouse?: (action: string, ...values: unknown[]) => void;
    }
}

export const mouseSize = 40;

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

/** The menu's ring: 48px buttons whose edges stand 10px clear of the 40px mouse, with 8px to spare round them. */
export const menuButton = 48;

export const menuRadius = mouseSize / 2 + 10 + menuButton / 2;

/** From the ring's centre to the edge of the box it is drawn in. */
export const menuReach = menuRadius + menuButton / 2 + 8;

/** Moves and sizes a webview of the mouse's in one step, in CSS pixels. On Linux, which lays child webviews out itself, it is the only way. */
const placeFloating = async (label: string, x: number, y: number, width: number, height: number) => {
    const { invoke } = await import('@tauri-apps/api/core');

    await invoke('browser_place', { label, x, y, width, height });
};

export const placeMouse = async (x: number, y: number) => placeFloating(mouseLabel, x, y, mouseSize, mouseSize);

/** The menu's webview, round a centre in CSS pixels. */
export const placeMouseMenu = async (centre: Point) => placeFloating(mouseMenuLabel, centre.x - menuReach, centre.y - menuReach, menuReach * 2, menuReach * 2);

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
        await placeMouse(point.x / window.devicePixelRatio, point.y / window.devicePixelRatio);

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

    await (await Webview.getByLabel(mouseMenuLabel))?.close();

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

const created = async (view: Webview) =>
    new Promise<void>((resolve, reject) => {
        void view.once('tauri://created', () => {
            resolve();
        });

        void view.once('tauri://error', (event) => {
            reject(new Error(String(event.payload)));
        });
    });

const openDesktop = async () => {
    const { emit } = await import('@tauri-apps/api/event');
    const { Webview, getCurrentWebview } = await import('@tauri-apps/api/webview');
    const { getCurrentWindow } = await import('@tauri-apps/api/window');

    // Drawn only if this capability lets the mouse's webview report a press and move itself.
    await Promise.all([emit('nura://mouse-probe'), getCurrentWebview().position(), getCurrentWindow().innerSize()]);

    const clamp = (value: number, room: number) => Math.min(Math.max(value, 0), Math.max(room - mouseSize, 0));

    const x = clamp(parked?.x ?? (window.innerWidth - mouseSize) / 2, window.innerWidth);
    const y = clamp(parked?.y ?? (window.innerHeight - mouseSize) / 2, window.innerHeight);

    // The menu first, so the mouse, made after it, is drawn over it and keeps every press on itself. It waits
    // hidden, already loaded, and places itself before it shows: growing or moving a webview that is on screen
    // draws its old picture in the new place for a frame, which is the flicker this keeps out of sight.
    const menu = new Webview(getCurrentWindow(), mouseMenuLabel, {
        url: 'index.html#mouse-menu',
        x: 0,
        y: 0,
        width: menuReach * 2,
        height: menuReach * 2,
        transparent: true,
        focus: false,
        dragDropEnabled: false
    });

    await created(menu);
    await menu.hide();

    if (getPlatform() === 'linux') {
        await placeMouseMenu({ x: menuReach, y: menuReach });
    }

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
    await created(view);

    // Linux ignores the position asked for above.
    if (getPlatform() === 'linux') {
        await placeMouse(x, y);
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

const glyphs = new Set<string>(['wallet', 'browser', 'full', 'exit'] satisfies MouseGlyph[]);

const readItem = (value: unknown): MouseMenuItem | undefined => {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }

    const { key, label, glyph, disabled } = value as Record<string, unknown>;

    if (typeof key !== 'string' || typeof label !== 'string' || typeof glyph !== 'string' || !glyphs.has(glyph)) {
        return undefined;
    }

    return { key, label, glyph: glyph as MouseGlyph, disabled: disabled === true };
};

const readPoint = (value: unknown): Point | undefined => {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }

    const { x, y } = value as Record<string, unknown>;

    return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
};

/** The menu as the desktop menu's webview is sent it, with the centre to lay it round, or undefined for anything else. */
export const readMouseMenu = (value: unknown): { items: MouseMenuItem[]; theme: 'light' | 'dark'; centre: Point } | undefined => {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }

    const { items, theme, centre } = value as Record<string, unknown>;

    const point = readPoint(centre);

    if (!Array.isArray(items) || (theme !== 'light' && theme !== 'dark') || point === undefined) {
        return undefined;
    }

    const read = items.map((item) => readItem(item));

    return read.every((item) => item !== undefined) && read.length > 0 ? { items: read, theme, centre: point } : undefined;
};

const tokenMap = {
    surface: '--base-2',
    line: '--line',
    ink: '--txt-normal',
    accent: '--btn-primary',
    onAccent: '--txt-on-primary',
    muted: '--txt-muted'
} as const satisfies Record<keyof MouseMenuColors, string>;

// The theme is written in oklch, which no native view reads, so each colour is painted once and read back as sRGB.
const readColors = (): MouseMenuColors => {
    const canvas = document.createElement('canvas');

    canvas.width = 1;
    canvas.height = 1;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    const style = getComputedStyle(document.documentElement);

    const hex = (name: string) => {
        if (context === null) {
            return '#000000';
        }

        context.clearRect(0, 0, 1, 1);
        context.fillStyle = '#000000';
        context.fillStyle = style.getPropertyValue(name).trim();
        context.fillRect(0, 0, 1, 1);

        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;

        return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
    };

    return {
        surface: hex(tokenMap.surface),
        line: hex(tokenMap.line),
        ink: hex(tokenMap.ink),
        accent: hex(tokenMap.accent),
        onAccent: hex(tokenMap.onAccent),
        muted: hex(tokenMap.muted)
    };
};

// Whether the desktop mouse's webview is up and listening, so a menu sent to it reaches something.
let desktopLive = false;

/**
 * Lays the menu round the native mouse, whose centre `at` is, above the browser and without touching it. It closes
 * again when a button is picked, when the mouse is pressed or dragged, or on a press anywhere else; on the desktop a
 * press while it is open reaches here again, and closes it. False where only the in-page mouse is drawn, whose menu the
 * wallet draws itself.
 */
export const openMouseMenu = (items: MouseMenuItem[], at: Point | undefined) => {
    const bridge = getNativeBrowser();

    if (bridge !== undefined) {
        if (bridge.showMouseMenu === undefined) {
            return false;
        }

        bridge.showMouseMenu(JSON.stringify({ items, colors: readColors() }));

        return true;
    }

    if (!desktopLive || at === undefined) {
        return false;
    }

    // The wallet's own webview fills the window from its corner, so its size is the room the ring has.
    const fit = (value: number, room: number) => Math.min(Math.max(value, menuReach), Math.max(room - menuReach, menuReach));

    const centre = { x: fit(at.x, window.innerWidth), y: fit(at.y, window.innerHeight) };

    const run = async () => {
        const { emit } = await import('@tauri-apps/api/event');

        // A mouse too near an edge for the ring steps in until it fits, and stays there. Moving it is no flicker:
        // only a webview that changes size is drawn a frame late.
        if (centre.x !== at.x || centre.y !== at.y) {
            const { Webview } = await import('@tauri-apps/api/webview');

            const view = await Webview.getByLabel(mouseLabel);
            const ratio = window.devicePixelRatio;

            if (view !== null) {
                await setMousePosition(view, { x: Math.round((centre.x - mouseSize / 2) * ratio), y: Math.round((centre.y - mouseSize / 2) * ratio) });
            }
        }

        await emit('nura://mouse-menu', { items, theme: getTheme(), centre });
    };

    void run().catch(() => undefined);

    return true;
};

/** Collapses the desktop menu, as a drag of the mouse starts; a native one closes itself on a drag. */
export const closeMouseMenu = () => {
    if (getNativeBrowser() !== undefined || !desktopLive) {
        return;
    }

    void import('@tauri-apps/api/event').then(async ({ emit }) => emit('nura://mouse-menu-close')).catch(() => undefined);
};

/**
 * Puts the mouse above every layer, OS-level tabs included, until the cleanup runs; `onFallback` asks for the in-page one.
 * `onMove` is told once each time a drag starts, not as the mouse travels, and `onPick` the key of a menu button pressed.
 * Tabs hold no event permission, so nothing a page runs can pose as a press or a pick.
 */
export const showMouse = ({
    onPress,
    onMove,
    onPick,
    onFallback
}: {
    onPress: (at: Point | undefined) => void;
    onMove: () => void;
    onPick: (key: string) => void;
    onFallback: () => void;
}) => {
    let live = true;

    const bridge = getNativeBrowser();

    if (bridge !== undefined) {
        if (bridge.showMouse === undefined) {
            onFallback();

            return () => undefined;
        }

        window.__nuraMouse = (action, ...values) => {
            const [first, second] = values;

            if (action === 'click') {
                onPress(typeof first === 'number' && typeof second === 'number' ? { x: first, y: second } : undefined);
            } else if (action === 'move') {
                onMove();
            } else if (action === 'pick' && typeof first === 'string') {
                onPick(first);
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

            bridge.hideMouseMenu?.();
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
                    } else if (event.payload === 'move') {
                        onMove();
                    }
                }),
                listen<unknown>('nura://mouse-pick', (event) => {
                    if (typeof event.payload === 'string') {
                        onPick(event.payload);
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

            desktopLive = live;
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
        desktopLive = false;

        stop?.();

        queue(closeDesktop);
    };
};
