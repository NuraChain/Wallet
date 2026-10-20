import { useState } from 'react';

import { getPlatform } from '../utility/platform';

export const useIsWindows = (): boolean => {
    const [isWindows] = useState(() => getPlatform() === 'windows');

    return isWindows;
};

/** On a phone the strip under the status bar and the browser header wear the site's colour; a desktop never does. */
export const useHasStatusBar = (): boolean => {
    const [hasStatusBar] = useState(() => {
        const host = getPlatform();

        return host === 'android' || host === 'ios';
    });

    return hasStatusBar;
};

/** An extension popup closes the moment it loses focus, so only a Tauri window or a native bridge hosts a page. */
export const useHasBrowser = (): boolean => {
    const [hasBrowser] = useState(() => {
        const host = getPlatform();

        return host !== 'extension';
    });

    return hasBrowser;
};

/**
 * Each host asks for the camera its own way (on Linux `camera.rs` enables capture); an extension cannot show the prompt, so it is left out.
 * A webview with the camera off, or that does not take the page as secure, lacks the interface altogether.
 */
export const useCanScan = (): boolean => {
    const [canScan] = useState(() => {
        const devices: MediaDevices | undefined = navigator.mediaDevices;

        return getPlatform() !== 'extension' && typeof devices?.getUserMedia === 'function';
    });

    return canScan;
};
