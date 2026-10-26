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

export type SiteDevice = 'microphone' | 'camera';

export interface BrowserFavorite {
    id: string;
    name: string;
    url: string;

    /** Allowed without asking each time. Off unless set. */
    microphone?: boolean;
    camera?: boolean;

    /** May show the system's notifications. Off unless set. */
    notifications?: boolean;
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
