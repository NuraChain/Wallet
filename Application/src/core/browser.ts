/**
 * Navigation state the Android bridge pushes back after every page event.
 */
export interface BrowserState { url: string; title: string; canBack: boolean; canForward: boolean; loading: boolean; progress: number }

/**
 * The Kotlin side of the native browser, injected as `__nuraBrowser` on the app's own webview only.
 *
 * Coordinates are CSS pixels; the bridge converts them to device pixels itself.
 */
interface BrowserBridge {
    open: (url: string, x: number, y: number, width: number, height: number) => void;
    setBounds: (x: number, y: number, width: number, height: number) => void;
    close: () => void;
    reload: () => void;
    back: () => void;
    forward: () => void;
}

declare global
{
    interface Window
    {
        __nuraBrowser?: BrowserBridge;
        __nuraBrowserState?: (state: BrowserState) => void;
    }
}

/**
 * getNativeBrowser - The Android bridge, when this build is running on one.
 *
 * Tauri's child-webview API is desktop only, so Android needs a real `android.webkit.WebView` driven
 * from Kotlin instead. Everywhere else this is `undefined` and callers fall back to the child webview.
 * @returns {BrowserBridge | undefined} The bridge, or `undefined` off Android.
 */
export const getNativeBrowser = () => window.__nuraBrowser;

/**
 * onNativeBrowserState - Subscribes to navigation updates from the native browser.
 *
 * Only one listener is meaningful because the bridge calls a single well-known global, so registering
 * replaces whatever was there; the returned function clears it again.
 * @param {(state: BrowserState) => void} listener Receives every navigation update.
 * @returns {() => void} Removes the listener.
 */
export const onNativeBrowserState = (listener: (state: BrowserState) => void) =>
{
    window.__nuraBrowserState = listener;

    return () =>
    {
        if (window.__nuraBrowserState === listener)
        {
            window.__nuraBrowserState = undefined;
        }
    };
};
