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
