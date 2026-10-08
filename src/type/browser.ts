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

/** What the browser's start page is showing. */
export type BrowserSection = 'favorite' | 'tabs' | 'history';

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

export interface BrowserFavorite {
    id: string;
    name: string;
    url: string;
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
