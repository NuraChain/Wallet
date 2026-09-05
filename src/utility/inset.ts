interface AndroidBridge {
    top: () => number;
    bottom: () => number;
}

declare global {
    interface Window {
        __nuraInset?: AndroidBridge;
    }
}

/**
 * Android's WebView fills `env(safe-area-inset-*)` from a display cutout and from nothing else, so
 * the status and navigation bars the window is laid out behind never reach CSS and every surface
 * that runs to a screen edge would draw underneath them. InsetBridge answers with the insets the
 * system does hand the view, and they are written over the `env()` seeds style.css declares.
 *
 * The Kotlin side pushes the same two variables whenever the insets change — a rotation, the
 * gesture bar swapping for buttons. This covers the first paint, which comes after the last push it
 * made, and that one landed on the document this one replaced.
 */
export const initInsets = () => {
    const bridge = window.__nuraInset;

    if (bridge === undefined) {
        return;
    }

    const { style } = document.documentElement;

    style.setProperty('--inset-top', `${bridge.top()}px`);
    style.setProperty('--inset-bottom', `${bridge.bottom()}px`);
};
