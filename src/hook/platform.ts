import { useState } from 'react';

import { getPlatform } from '../utility/platform';

export const useIsWindows = (): boolean => {
    const [isWindows] = useState(() => getPlatform() === 'windows');

    return isWindows;
};

/**
 * Whether the wallet can host a page itself. A Tauri window opens a child webview for it, and
 * Android and iOS each hand one over natively — BrowserBridge.kt and BrowserBridge.mm both answer
 * to `window.__nuraBrowser`. An extension popup is a document the browser closes the moment it
 * loses focus — the browser it lives in is the one that browses.
 */
export const useHasBrowser = (): boolean => {
    const [hasBrowser] = useState(() => {
        const host = getPlatform();

        return host !== 'extension';
    });

    return hasBrowser;
};

/**
 * Whether a QR code can be read off the camera here. That takes a camera the page may ask for and
 * a host that puts the question to the user: WebView2 asks on Windows, and on Android the webview's
 * client asks for the permission the manifest already names.
 *
 * Nowhere else does yet. A docked panel or a popup of an extension has nowhere to show the
 * browser's question, so the request is refused unseen. macOS and iOS refuse without a usage
 * description in the bundle — and on macOS that one key would hand the camera to every page in the
 * browser tab as well, since wry grants whatever a webview asks. WebKitGTK has capture switched off.
 *
 * The camera's own interface is looked for too: a webview that has it switched off, or does not
 * take the page for a secure one, leaves it out altogether.
 */
export const useCanScan = (): boolean => {
    const [canScan] = useState(() => {
        const host = getPlatform();
        const devices: MediaDevices | undefined = navigator.mediaDevices;

        return (host === 'windows' || host === 'android') && typeof devices?.getUserMedia === 'function';
    });

    return canScan;
};
