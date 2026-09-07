import type { Host } from '../utility/platform.type';
import type { StorageKey } from '../utility/storage.key';

/** Durable key/value storage. Values are always strings — callers stringify their own shapes. */
export interface PlatformStorage {
    get: (key: StorageKey) => Promise<string | undefined>;
    set: (key: StorageKey, value: string) => Promise<void>;
    remove: (keys: StorageKey[]) => Promise<void>;
}

/**
 * Writing a file out to wherever the host keeps the user's own files. Both answers are the empty
 * string on success and a reason on failure, which is what the phrase screen puts on the page.
 */
export interface PlatformExporter {
    saveImage: (base64Png: string, name: string) => Promise<string>;
    saveText: (text: string, name: string) => Promise<string>;
}

/**
 * Everything the wallet needs from the thing it is running inside — a Tauri window today, a
 * browser extension next. One implementation per target, picked by the `#platform-impl` alias, so
 * a build never carries another target's code.
 */
export interface Platform {
    readonly storage: PlatformStorage;
    readonly host: () => Host;
    readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
    readonly openUrl: (url: string) => Promise<void>;
    readonly exporter: () => PlatformExporter;
}
