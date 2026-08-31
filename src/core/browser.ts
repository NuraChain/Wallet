import { getValue, removeValue, setValue } from '../utility/storage';

import { imageCache } from './image';

export interface BrowserState {
    id?: string;
    url: string;
    title: string;
    canBack: boolean;
    canForward: boolean;
    loading: boolean;
    progress: number;
}

export type BrowserView = 'mobile' | 'desktop';

export interface BrowserVisit {
    url: string;
    time: number;
}

export interface BrowserTab {
    id: number;
    entries: string[];
    index: number;
    draft: string;
    reload: number;
    home: boolean;
}

export const atBrowserStart = (tab: BrowserTab) => tab.home || tab.index < 0;

export const frameLabel = (id: number) => `nura-browser-${id}`;

export interface BrowserFavorite {
    id: string;
    name: string;
    url: string;
}

const defaultFavorites: BrowserFavorite[] = [
    { id: 'nurachain', name: 'Nura Chain', url: 'https://nurachain.net' },
    { id: 'swap', name: 'Swap', url: 'https://swap.nurachain.net' },
    { id: 'telegram', name: 'Telegram', url: 'https://t.me/nurachain' },
    { id: 'google', name: 'Google', url: 'https://google.com' },
    { id: 'github', name: 'GitHub', url: 'https://github.com/NuraChain' },
    { id: 'discord', name: 'Discord', url: 'https://discord.gg/ykW3PU64h9' }
];

const historyLimit = 40;

export const getSiteHost = (url: string) => {
    try {
        return new URL(url).host.replace(/^www\./u, '');
    } catch {
        return url;
    }
};

export const getSiteIcon = (url: string) => {
    try {
        return new URL('/favicon.ico', url).href;
    } catch {
        return '';
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
}

export interface NativeTab {
    open: (url: string, visible: boolean, x: number, y: number, width: number, height: number) => void;
    setBounds: (x: number, y: number, width: number, height: number) => void;
    close: () => void;
    setVisible: (visible: boolean) => void;
    reload: () => void;
    back: () => void;
    forward: () => void;
    hides: boolean;
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

            await Promise.all(views.filter((view) => view.label.startsWith('nura-browser-')).map(async (view) => view.close()));
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

export const onNativeBrowserState = (listener: (state: BrowserState) => void) => {
    window.__nuraBrowserState = listener;

    return () => {
        if (window.__nuraBrowserState === listener) {
            window.__nuraBrowserState = undefined;
        }
    };
};
