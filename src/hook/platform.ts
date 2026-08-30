import { useState } from 'react';
import { platform } from '@tauri-apps/plugin-os';

export const useIsWindows = (): boolean => {
    const [isWindows] = useState(() => {
        try {
            return platform() === 'windows';
        } catch {
            return false;
        }
    });

    return isWindows;
};
