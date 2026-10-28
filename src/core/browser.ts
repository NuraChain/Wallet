import config from '../config';
import { inkOn } from '../utility/color';
import { getValue, removeValue, setValue } from '../utility/storage';

import { imageCache } from './image';
import { clearSiteIcons } from './site.icon';
import type { BrowserFavorite, BrowserState, BrowserTab, BrowserView, BrowserVisit, NativeTab, SiteDevice } from '../type/browser';

export const atBrowserStart = (tab: BrowserTab) => tab.home || tab.index < 0;

export const frameLabel = (id: number) => `nura-browser-${id}`;

/** Not a page, so outside `nura-browser-*`. */
export const mouseLabel = 'nura-mouse';

const defaultFavorites: BrowserFavorite[] = config.favorites;

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

/** Read fresh per request, and held by the favourite's exact origin, never by wherever it forwards to. */
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

/** Held the same way as a device: by a favourite at the exact origin. */
export const getSiteNotices = async (origin: string): Promise<boolean> =>
    origin.length > 0 && (await getBrowserFavorites().catch(() => [])).some((item) => originOf(item.url) === origin && item.notifications === true);

/** Only Android's bridge brings a page's device requests to the wallet. */
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

    clearData?: () => void;

    showMouse?: (opacity: number) => void;
    hideMouse?: () => void;
    setMouseOpacity?: (opacity: number) => void;
    setMouseIcon?: (icon: string) => void;

    /** Lays the menu round the mouse, over every page: JSON of `{ items, colors }`. A pick comes back through `__nuraMouse('pick', key)`. */
    showMouseMenu?: (menu: string) => void;
    hideMouseMenu?: () => void;

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

/** Native layers sit above the page and outlive a reload or activity restore, so the lock screen closes them. */
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

/** Closes every page and drops what the sites it visited kept on the device: cookies, storage and cache. */
export const clearBrowsingData = async () => {
    const bridge = window.__nuraBrowser;

    if (bridge !== undefined) {
        bridge.clearData?.();

        return;
    }

    try {
        const { invoke } = await import('@tauri-apps/api/core');

        await invoke('browser_clear');
    } catch {
        // Only a desktop window has an in-app browser to clear.
    }
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

/* A page's colour is kept until it sends another, and worn only while its page is in view. */
const themes = new Map<string, string>();

let shownPage = '';
let tint = '';

let tintAt = 0;
let tintTimer: ReturnType<typeof setTimeout> | undefined;

const tintListeners = new Set<() => void>();

/* Throttles colour changes so a page that changes every frame cannot flash the header. */
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

    window.__nuraBrowser?.setBarInk?.(next.length > 0 ? inkOn(next) : '');

    for (const listener of tintListeners) {
        listener();
    }
};

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

export const showSiteTheme = (label: string) => {
    shownPage = label;

    wear();
};

export const forgetSiteThemes = () => {
    themes.clear();

    shownPage = '';

    wear();
};

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
