import { inkOn } from '../utility/color';
import { getValue, removeValue, setValue } from '../utility/storage';

import { imageCache } from './image';
import { clearSiteIcons } from './site.icon';
import type { BrowserFavorite, BrowserState, BrowserTab, BrowserView, BrowserVisit, NativeTab, SiteDevice } from '../type/browser';

export const atBrowserStart = (tab: BrowserTab) => tab.home || tab.index < 0;

export const frameLabel = (id: number) => `nura-browser-${id}`;

/** The floating mouse's own webview on desktop — not a page, so outside `nura-browser-*`. */
export const mouseLabel = 'nura-mouse';

const defaultFavorites: BrowserFavorite[] = [
    { id: 'goman', name: 'Goman', url: 'https://goman.online' },
    { id: 'swap', name: 'Swap', url: 'https://swap.nurachain.net' },
    { id: 'nurachain', name: 'Nura Chain', url: 'https://nurachain.net' },
    { id: 'discord', name: 'Discord', url: 'https://discord.gg/ykW3PU64h9' },
    { id: 'telegram', name: 'Nura Telegram', url: 'https://t.me/nurachain' }
];

const historyLimit = 40;

export const getSiteHost = (url: string) => {
    try {
        return new URL(url).host.replace(/^www\./u, '');
    } catch {
        return url;
    }
};

export const getBrowserView = async (): Promise<BrowserView> => {
    const stored = await getValue('Browser.View');

    return stored === 'desktop' ? 'desktop' : 'mobile';
};

export const setBrowserView = async (view: BrowserView) => setValue('Browser.View', view);

export const getBrowserHistory = async (): Promise<BrowserVisit[]> => {
    const stored = await getValue('Browser.History');

    if (stored === undefined) {
        return [];
    }

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(stored) as BrowserVisit[];

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((item) => typeof item?.url === 'string' && item.url.length > 0 && typeof item.time === 'number');
    } catch {
        return [];
    }
};

export const addBrowserVisit = async (url: string): Promise<BrowserVisit[]> => {
    const current = await getBrowserHistory();

    const next = [{ url, time: Date.now() }, ...current.filter((item) => item.url !== url)].slice(0, historyLimit);

    await setValue('Browser.History', JSON.stringify(next));

    return next;
};

export const clearBrowserHistory = async () => {
    await removeValue('Browser.History');

    clearSiteIcons();

    await imageCache.clearKind('unknown');
};

export const getBrowserFavorites = async (): Promise<BrowserFavorite[]> => {
    const stored = await getValue('Browser.Favorites');

    if (stored === undefined) {
        return defaultFavorites;
    }

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(stored) as BrowserFavorite[];

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((item) => typeof item?.id === 'string' && typeof item.name === 'string' && typeof item.url === 'string' && item.url.length > 0);
    } catch {
        return [];
    }
};

export const setBrowserFavorites = async (list: BrowserFavorite[]) => setValue('Browser.Favorites', JSON.stringify(list));

const originOf = (url: string) => {
    try {
        return new URL(url).origin;
    } catch {
        return '';
    }
};

/**
 * The devices a site has been given through a favourite, read fresh each time so a switch thrown
 * in the form counts from the next request on.
 *
 * It is the favourite's own origin that holds them, and nothing wider. A favourite that only
 * forwards — an invite link, a short address — hands them to the address it was saved under, not
 * to wherever that leads, since the page asking is then a different site.
 */
export const getSiteDevices = async (origin: string): Promise<SiteDevice[]> => {
    if (origin.length === 0) {
        return [];
    }

    const held = (await getBrowserFavorites().catch(() => [])).filter((item) => originOf(item.url) === origin);

    const devices: SiteDevice[] = [];

    if (held.some((item) => item.microphone === true)) {
        devices.push('microphone');
    }

    if (held.some((item) => item.camera === true)) {
        devices.push('camera');
    }

    return devices;
};

/** Whether the wallet is the one a page's device requests come to: only Android's bridge brings them. */
export const managesSiteDevices = () => window.__nuraBrowser?.permissionReply !== undefined;

interface BrowserBridge {
    open: (url: string, x: number, y: number, width: number, height: number) => void;
    setBounds: (x: number, y: number, width: number, height: number) => void;
    close: () => void;
    closeAll?: () => void;
    reload: () => void;
    back: () => void;
    forward: () => void;

    setDesktop?: (desktop: boolean) => void;

    setVisible?: (visible: boolean) => void;

    openTab?: (id: string, url: string, visible: boolean, x: number, y: number, width: number, height: number) => void;
    boundsTab?: (id: string, x: number, y: number, width: number, height: number) => void;
    closeTab?: (id: string) => void;
    visibleTab?: (id: string, visible: boolean) => void;
    reloadTab?: (id: string) => void;
    backTab?: (id: string) => void;
    forwardTab?: (id: string) => void;

    setDappScript?: (script: string) => void;

    dappReply?: (id: string, payload: string) => void;

    dappEmit?: (id: string, payload: string) => void;

    permissionReply?: (ticket: string, allowed: boolean) => void;

    showMouse?: (opacity: number) => void;
    hideMouse?: () => void;
    setMouseOpacity?: (opacity: number) => void;
    setMouseIcon?: (icon: string) => void;

    /** The ink the system draws its status bar in: `dark`, `light`, or empty for its own choice. */
    setBarInk?: (ink: string) => void;
}

declare global {
    interface Window {
        __nuraBrowser?: BrowserBridge;
        __nuraBrowserState?: (state: BrowserState) => void;
    }
}

export const getNativeBrowser = () => window.__nuraBrowser;

/**
 * Close every native browser layer, wherever it came from. The multiwebview children (desktop)
 * and the Kotlin WebViews (Android) sit above the app's own page, so a JS context that starts
 * over — a reload, an Android activity restore — lands on the unlock screen underneath layers
 * nobody owns any more. The lock screen calls this to take the surface back.
 */
export const closeBrowserLayers = () => {
    const bridge = window.__nuraBrowser;

    if (bridge !== undefined) {
        if (bridge.closeAll === undefined) {
            bridge.close();
        } else {
            bridge.closeAll();
        }

        return;
    }

    const run = async () => {
        try {
            const { getAllWebviews } = await import('@tauri-apps/api/webview');

            const views = await getAllWebviews();

            await Promise.all(views.filter((view) => view.label.startsWith('nura-browser-') || view.label === mouseLabel).map(async (view) => view.close()));
        } catch {
            // Outside Tauri there is nothing to close.
        }
    };

    void run();
};

export const nativeHoldsTabs = () => window.__nuraBrowser?.openTab !== undefined;

export const getNativeTab = (id: string): NativeTab | undefined => {
    const bridge = window.__nuraBrowser;

    if (bridge === undefined) {
        return undefined;
    }

    const { openTab, boundsTab, closeTab, visibleTab, reloadTab, backTab, forwardTab } = bridge;

    if (
        openTab !== undefined &&
        boundsTab !== undefined &&
        closeTab !== undefined &&
        visibleTab !== undefined &&
        reloadTab !== undefined &&
        backTab !== undefined &&
        forwardTab !== undefined
    ) {
        return {
            open: (url, visible, x, y, width, height) => {
                openTab.call(bridge, id, url, visible, x, y, width, height);
            },
            setBounds: (x, y, width, height) => {
                boundsTab.call(bridge, id, x, y, width, height);
            },
            close: () => {
                closeTab.call(bridge, id);
            },
            setVisible: (visible) => {
                visibleTab.call(bridge, id, visible);
            },
            reload: () => {
                reloadTab.call(bridge, id);
            },
            back: () => {
                backTab.call(bridge, id);
            },
            forward: () => {
                forwardTab.call(bridge, id);
            },
            hides: true
        };
    }

    const { setVisible } = bridge;

    return {
        open: (url, visible, x, y, width, height) => {
            bridge.open(url, x, y, width, height);
        },
        setBounds: (x, y, width, height) => {
            bridge.setBounds(x, y, width, height);
        },
        close: () => {
            bridge.close();
        },
        setVisible: (visible) => {
            setVisible?.call(bridge, visible);
        },
        reload: () => {
            bridge.reload();
        },
        back: () => {
            bridge.back();
        },
        forward: () => {
            bridge.forward();
        },
        hides: setVisible !== undefined
    };
};

/* What each open page has asked the wallet's chrome to wear, by the page's label, and which page
   is the one on show. A page says its colour once and is taken at its word until it says another,
   so the colour is still there after a trip to the start page and back; it is worn only while its
   page is the one in view. */
const themes = new Map<string, string>();

let shownPage = '';
let tint = '';

let tintAt = 0;
let tintTimer: ReturnType<typeof setTimeout> | undefined;

const tintListeners = new Set<() => void>();

/* The least time between two colours a page can put on the chrome. A page may change its mind as
   often as it likes, and one that did so on every frame would have the wallet's header flashing in
   time with it. */
const tintGap = 300;

const wear = () => {
    if (tintTimer !== undefined) {
        clearTimeout(tintTimer);

        tintTimer = undefined;
    }

    const next = themes.get(shownPage) ?? '';

    if (next === tint) {
        return;
    }

    tint = next;
    tintAt = Date.now();

    // Where the system draws over the colour — a phone's status bar — its ink has to turn with it.
    window.__nuraBrowser?.setBarInk?.(next.length > 0 ? inkOn(next) : '');

    for (const listener of tintListeners) {
        listener();
    }
};

/** A page's colour for the wallet's chrome, as the bridge read it; the empty string for none. */
export const setSiteTheme = (label: string, color: string) => {
    if (color.length > 0) {
        themes.set(label, color);
    } else {
        themes.delete(label);
    }

    if (label !== shownPage || tintTimer !== undefined) {
        return;
    }

    const wait = tintAt + tintGap - Date.now();

    if (wait > 0) {
        tintTimer = setTimeout(wear, wait);
    } else {
        wear();
    }
};

/** Which page's colour the chrome wears: the one in view, or the empty string while none is. */
export const showSiteTheme = (label: string) => {
    shownPage = label;

    wear();
};

/** Every page is gone, and the chrome goes back to the wallet's own colours. */
export const forgetSiteThemes = () => {
    themes.clear();

    shownPage = '';

    wear();
};

/** The colour the wallet's chrome wears now, as `#rrggbb`, or the empty string for its own. */
export const getTint = () => tint;

export const subscribeTint = (listener: () => void) => {
    tintListeners.add(listener);

    return () => {
        tintListeners.delete(listener);
    };
};

export const onNativeBrowserState = (listener: (state: BrowserState) => void) => {
    window.__nuraBrowserState = listener;

    return () => {
        if (window.__nuraBrowserState === listener) {
            window.__nuraBrowserState = undefined;
        }
    };
};
