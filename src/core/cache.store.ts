type CacheArea = 'local' | 'session';

const shim = new Map<string, string>();

const broken = new Set<CacheArea>();

const backend = (area: CacheArea): Storage | undefined => {
    if (broken.has(area)) {
        return undefined;
    }

    try {
        const store = area === 'local' ? localStorage : sessionStorage;

        const probe = '__cache_probe__';

        store.setItem(probe, '1');
        store.removeItem(probe);

        return store;
    } catch {
        broken.add(area);

        return undefined;
    }
};

const dirty = new Map<CacheArea, Map<string, string>>();

let timer: ReturnType<typeof setTimeout> | undefined;

const flushDelay = 250;

export const cacheLog = (event: string, key: string, detail = '') => {
    if (import.meta.env.DEV) {
        // oxlint-disable-next-line no-console
        console.debug(`[cache] ${event} ${key}${detail.length > 0 ? ` ${detail}` : ''}`);
    }
};

const flush = () => {
    timer = undefined;

    for (const [area, pending] of dirty) {
        const store = backend(area);

        for (const [key, value] of pending) {
            if (store === undefined) {
                shim.set(`${area}:${key}`, value);

                continue;
            }

            try {
                store.setItem(key, value);
            } catch {
                cacheLog('quota', key);
            }
        }
    }

    dirty.clear();
};

export const readRaw = (area: CacheArea, key: string) => {
    const pending = dirty.get(area)?.get(key);

    if (pending !== undefined) {
        return pending;
    }

    const store = backend(area);

    if (store === undefined) {
        return shim.get(`${area}:${key}`);
    }

    try {
        return store.getItem(key) ?? undefined;
    } catch {
        return undefined;
    }
};

export const writeRaw = (area: CacheArea, key: string, value: string) => {
    const pending = dirty.get(area) ?? new Map<string, string>();

    pending.set(key, value);

    dirty.set(area, pending);

    timer ??= setTimeout(flush, flushDelay);
};

export const removeRaw = (area: CacheArea, key: string) => {
    dirty.get(area)?.delete(key);

    const store = backend(area);

    if (store === undefined) {
        shim.delete(`${area}:${key}`);

        return;
    }

    try {
        store.removeItem(key);
    } catch {}
};

export const keysUnder = (area: CacheArea, prefix: string) => {
    const found = new Set<string>();

    for (const key of dirty.get(area)?.keys() ?? []) {
        if (key.startsWith(prefix)) {
            found.add(key);
        }
    }

    const store = backend(area);

    if (store === undefined) {
        for (const key of shim.keys()) {
            if (key.startsWith(`${area}:${prefix}`)) {
                found.add(key.slice(area.length + 1));
            }
        }

        return [...found];
    }

    try {
        for (let index = 0; index < store.length; index += 1) {
            const key = store.key(index);

            if (key?.startsWith(prefix) === true) {
                found.add(key);
            }
        }
    } catch {
        return [...found];
    }

    return [...found];
};

export const prune = (area: CacheArea, prefix: string, keep: number, stampOf: (raw: string) => number) => {
    const keys = keysUnder(area, prefix);

    if (keys.length <= keep) {
        return;
    }

    const ranked = keys.map((key) => ({ key, stamp: stampOf(readRaw(area, key) ?? '') }));

    ranked.sort((left, right) => left.stamp - right.stamp);

    for (const item of ranked.slice(0, keys.length - keep)) {
        removeRaw(area, item.key);

        cacheLog('evict', item.key);
    }
};

export const clearUnder = (area: CacheArea, prefix: string, match?: (key: string) => boolean) => {
    for (const key of keysUnder(area, prefix)) {
        if (match === undefined || match(key.slice(prefix.length))) {
            removeRaw(area, key);

            cacheLog('invalidate', key);
        }
    }
};
