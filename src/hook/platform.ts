import { useState } from 'react';

import { getPlatform } from '../utility/platform';

export const useIsWindows = (): boolean => {
    const [isWindows] = useState(() => getPlatform() === 'windows');

    return isWindows;
};

/**
 * Whether the wallet can host a page itself. A Tauri window opens a child webview for it and
 * Android hands one over from Kotlin; iOS has neither, and an extension popup is a document the
 * browser closes the moment it loses focus — the browser it lives in is the one that browses.
 */
export const useHasBrowser = (): boolean => {
    const [hasBrowser] = useState(() => {
        const host = getPlatform();

        return host !== 'ios' && host !== 'extension';
    });

    return hasBrowser;
};

/**
 * Whether the app draws its own title bar. A Tauri window on Windows has the system's turned off,
 * and a browser gives an extension document none at all — on both, the strip across the top of the
 * page is the wallet's own, and every screen below has to keep out from under it.
 */
export const useHasTitleBar = (): boolean => {
    const [hasTitleBar] = useState(() => {
        const host = getPlatform();

        return host === 'windows' || host === 'extension';
    });

    return hasTitleBar;
};
