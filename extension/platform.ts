import type { Vault } from '../src/core/vault';
import type { Platform, PlatformExporter, PlatformSession } from '../src/platform/type';

/** How long an unlocked wallet survives without being touched. */
export const idleMinutes = 15;

const sessionKey = 'Session';

interface SessionRecord {
    vault: Vault;
    expiresAt: number;
}

const deadline = () => Date.now() + idleMinutes * 60_000;

const readRecord = async (): Promise<SessionRecord | undefined> => {
    const held = await chrome.storage.session.get(sessionKey);

    const record = held[sessionKey] as SessionRecord | undefined;

    if (record === undefined || typeof record.expiresAt !== 'number') {
        return undefined;
    }

    if (record.expiresAt <= Date.now()) {
        await chrome.storage.session.remove(sessionKey);

        return undefined;
    }

    return record;
};

/**
 * `chrome.storage.session` is the one store the browser keeps in memory and never writes to
 * disk, clears when the browser closes, and — at its default access level — hides from content
 * scripts. That makes it the only place an evictable worker can leave a decrypted seed and still
 * be holding it a moment later. It outlives the popup, which the module variable it replaces did
 * not, so the deadline below is what takes its place: nothing else would ever lock the wallet.
 */
const browserSession: PlatformSession = {
    read: async () => (await readRecord())?.vault,

    write: async (vault) => {
        if (vault === undefined) {
            await chrome.storage.session.remove(sessionKey);

            return;
        }

        await chrome.storage.session.set({ [sessionKey]: { vault, expiresAt: deadline() } satisfies SessionRecord });
    },

    watch: (listener) => {
        const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area !== 'session' || !(sessionKey in changes)) {
                return;
            }

            const record = changes[sessionKey]?.newValue as SessionRecord | undefined;

            listener(record?.vault);
        };

        chrome.storage.onChanged.addListener(onChanged);

        return () => {
            chrome.storage.onChanged.removeListener(onChanged);
        };
    },

    touch: async () => {
        const record = await readRecord();

        if (record !== undefined) {
            await chrome.storage.session.set({ [sessionKey]: { ...record, expiresAt: deadline() } satisfies SessionRecord });
        }
    }
};

const save = async (href: string, name: string, revoke = false) => {
    if (globalThis.document === undefined) {
        return 'unsupported';
    }

    try {
        const anchor = document.createElement('a');

        anchor.href = href;
        anchor.download = name;

        document.body.append(anchor);
        anchor.click();
        anchor.remove();

        if (revoke) {
            URL.revokeObjectURL(href);
        }

        return '';
    } catch (cause) {
        return cause instanceof Error && cause.message.length > 0 ? cause.message : 'failed';
    }
};

/**
 * A service worker has no DOM to hang an anchor on, so the export only works from a page. Every
 * caller is one — the phrase screen — and the word matches what the Android bridge answers when
 * it refuses, so the screen already knows how to say it.
 */
const anchorExporter: PlatformExporter = {
    saveImage: async (base64Png: string, name: string) => save(`data:image/png;base64,${base64Png}`, name),

    saveText: async (text: string, name: string) => save(URL.createObjectURL(new Blob([text], { type: 'text/plain' })), name, true)
};

export const platform: Platform = {
    session: browserSession,

    storage: {
        get: async (key) => {
            const held = await chrome.storage.local.get(key);

            const value: unknown = held[key];

            return typeof value === 'string' ? value : undefined;
        },

        set: async (key, value) => chrome.storage.local.set({ [key]: value }),

        remove: async (keys) => chrome.storage.local.remove(keys)
    },

    host: () => 'extension',

    // With host permissions this is not subject to CORS, which is the one thing the Tauri HTTP
    // plugin was carrying for the app. Nothing else about it differs from the global.
    fetch: async (url, init) => fetch(url, init),

    openUrl: async (url) => {
        await chrome.tabs.create({ url });
    },

    exporter: () => anchorExporter
};
