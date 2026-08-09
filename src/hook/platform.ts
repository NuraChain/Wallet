import { useState } from 'react';
import { platform } from '@tauri-apps/plugin-os';

/**
 * Report whether the app is running on Windows.
 *
 * The platform never changes for the lifetime of the process, so the value is resolved once during the first render and kept for every subsequent one.
 *
 * `platform()` throws when the app is served outside a Tauri window (plain browser preview), in which case the hook reports `false`.
 * @returns {boolean} True when the host platform is Windows.
 */
export const useIsWindows = (): boolean =>
{
    const [ isWindows ] = useState(() =>
    {
        try
        {
            return platform() === 'windows';
        }
        catch
        {
            return false;
        }
    });

    return isWindows;
};
