/** The in-app browser: its tabs, pages, favourites and the native bridge that draws them. */

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

/** A device a page can ask for. */
export type SiteDevice = 'microphone' | 'camera';

export interface BrowserFavorite {
    id: string;
    name: string;
    url: string;

    /** Devices the site at this address may use without being asked each time. Off unless set. */
    microphone?: boolean;
    camera?: boolean;
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
