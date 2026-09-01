import { type Platform, platform } from '@tauri-apps/plugin-os';

/** The host the app is running on, plus the case of not running on one at all. */
export type Host = Platform | 'unknown';

let current: Host | undefined;

/**
 * Outside a Tauri window — `npm run dev` in a plain browser — the plugin throws, and 'unknown' is
 * the honest answer there. Read once and kept: the host cannot change while the process lives, and
 * the callers are on render paths.
 */
export const getPlatform = (): Host => {
    if (current === undefined) {
        try {
            current = platform();
        } catch {
            current = 'unknown';
        }
    }

    return current;
};
