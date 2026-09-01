import { useState } from 'react';

import { getPlatform } from '../utility/platform';

export const useIsWindows = (): boolean => {
    const [isWindows] = useState(() => getPlatform() === 'windows');

    return isWindows;
};

/**
 * iOS has neither the desktop multiwebview nor Android's Kotlin browser bridge, so the features
 * that stand on a second native webview are withheld there rather than left to throw at the user.
 * Drop this once gen/apple carries a Swift BrowserBridge.
 */
export const useIsIos = (): boolean => {
    const [isIos] = useState(() => getPlatform() === 'ios');

    return isIos;
};
