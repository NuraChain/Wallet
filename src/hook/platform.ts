import { useState } from 'react';

import { platform } from '../platform';
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
 * Whether to offer the browser's own docked panel. Read once, like the rest of this file: the
 * answer turns on which document this is and which window opened it, and neither can change while
 * the screen asking is on the screen.
 */
export const useHasPanel = (): boolean => {
    const [hasPanel] = useState(() => platform.panel.available());

    return hasPanel;
};
