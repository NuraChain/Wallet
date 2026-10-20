import { getPlatform } from './platform';

interface AndroidBridge {
    top: () => number;
    bottom: () => number;

    /** Absent from a build older than the page it is running. */
    bar?: () => number;
}

declare global {
    interface Window {
        __nuraInset?: AndroidBridge;
    }
}

/**
 * Android's WebView fills `env(safe-area-inset-*)` only from a cutout, so InsetBridge's insets are written over style.css's seeds.
 * iOS fills `env()` itself, and its bottom inset is only the home indicator, so the browser has no bar to stop short of.
 */
export const initInsets = () => {
    const { style } = document.documentElement;

    const bridge = window.__nuraInset;

    if (bridge === undefined) {
        if (getPlatform() === 'ios') {
            style.setProperty('--inset-bar', '0px');
        }

        return;
    }

    style.setProperty('--inset-top', `${bridge.top()}px`);
    style.setProperty('--inset-bottom', `${bridge.bottom()}px`);

    // Left as style.css seeds it — the whole bottom inset — where the bridge cannot say.
    if (bridge.bar !== undefined) {
        style.setProperty('--inset-bar', `${bridge.bar()}px`);
    }
};
