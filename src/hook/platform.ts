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
 * a host that puts the question to the user, which each does its own way: WebView2 asks on Windows;
 * on Android the webview's client asks for the permission the manifest names; macOS and iOS ask
 * once the bundle says what the camera is for, in `Info.plist` and `Info.ios.plist`; and on Linux
 * `camera.rs` switches on the capture WebKitGTK ships without, for the wallet's webview alone.
 *
 * An extension is the one host left out. Its docked panel and its popup have nowhere to show the
 * browser's question, so the request is refused unseen.
 *
 * The camera's own interface is looked for too: a webview that has it switched off, or does not
 * take the page for a secure one, leaves it out altogether.
 */
export const useCanScan = (): boolean => {
    const [canScan] = useState(() => {
        const devices: MediaDevices | undefined = navigator.mediaDevices;

        return getPlatform() !== 'extension' && typeof devices?.getUserMedia === 'function';
    });

    return canScan;
};
