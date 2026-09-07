import type { Platform, PlatformExporter } from '../src/platform/type';

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
