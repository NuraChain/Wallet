/**
 * Which Web Storage a cache lives in.
 *
 * `local` survives the app being closed and reopened; `session` lasts as long as the window does and
 * is gone on the next launch. The choice is a statement about the data, not about convenience: a
 * transaction that happened stays happened, so history belongs in `local`, while a balance read
 * minutes ago is only true of that moment and must not come back looking current after a restart.
 */
type CacheArea = 'local' | 'session';

/**
 * Fallback for a webview that refuses Web Storage.
 *
 * Private modes and locked-down webviews can have `localStorage` present but throwing on every call,
 * and a cache is never worth failing a render over — so everything degrades to this map, which behaves
 * identically and simply does not outlive the process.
 */
const shim = new Map<string, string>();

/** Areas already proven unusable, so a throwing backend is only discovered once. */
const broken = new Set<CacheArea>();

/**
 * backend - The storage object for an area, or `undefined` when it cannot be used.
 * @param {CacheArea} area Which storage to reach for.
 * @returns {Storage | undefined} The storage, or `undefined` to use the shim.
 */
const backend = (area: CacheArea): Storage | undefined =>
{
    if (broken.has(area))
    {
        return undefined;
    }

    try
    {
        const store = area === 'local' ? localStorage : sessionStorage;

        // Presence is not availability: a blocked backend throws here rather than on construction.
        const probe = '__cache_probe__';

        store.setItem(probe, '1');
        store.removeItem(probe);

        return store;
    }
    catch
    {
        broken.add(area);

        return undefined;
    }
};

/** Pending writes, per area, flushed together rather than one serialization per set. */
const dirty = new Map<CacheArea, Map<string, string>>();

let timer: ReturnType<typeof setTimeout> | undefined;

/** How long writes are collected before one batched flush. */
const flushDelay = 250;

/**
 * log - Development-only cache tracing, dropped from a production build.
 * @param {string} event What happened.
 * @param {string} key The entry it happened to.
 * @param {string} [detail] Anything worth adding.
 */
export const cacheLog = (event: string, key: string, detail = '') =>
{
    if (import.meta.env.DEV)
    {
        // eslint-disable-next-line no-console
        console.debug(`[cache] ${ event } ${ key }${ detail.length > 0 ? ` ${ detail }` : '' }`);
    }
};

/**
 * flush - Writes every pending entry, in one pass per area.
 *
 * A quota failure drops that one write and leaves the rest alone: losing a cache entry costs a refetch,
 * which is not worth surfacing or retrying.
 */
const flush = () =>
{
    timer = undefined;

    for (const [ area, pending ] of dirty)
    {
        const store = backend(area);

        for (const [ key, value ] of pending)
        {
            if (store === undefined)
            {
                shim.set(`${ area }:${ key }`, value);

                continue;
            }

            try
            {
                store.setItem(key, value);
            }
            catch
            {
                cacheLog('quota', key);
            }
        }
    }

    dirty.clear();
};

/**
 * readRaw - Reads one entry, synchronously.
 * @param {CacheArea} area Which storage to read.
 * @param {string} key The full key, prefix included.
 * @returns {string | undefined} What is stored, or `undefined`.
 */
export const readRaw = (area: CacheArea, key: string) =>
{
    // A write still sitting in the batch is the newest truth, so it answers before storage does.
    const pending = dirty.get(area)?.get(key);

    if (pending !== undefined)
    {
        return pending;
    }

    const store = backend(area);

    if (store === undefined)
    {
        return shim.get(`${ area }:${ key }`);
    }

    try
    {
        return store.getItem(key) ?? undefined;
    }
    catch
    {
        return undefined;
    }
};

/**
 * writeRaw - Queues one entry for the next batched flush.
 * @param {CacheArea} area Which storage to write.
 * @param {string} key The full key, prefix included.
 * @param {string} value The serialized payload.
 */
export const writeRaw = (area: CacheArea, key: string, value: string) =>
{
    const pending = dirty.get(area) ?? new Map<string, string>();

    pending.set(key, value);

    dirty.set(area, pending);

    timer ??= setTimeout(flush, flushDelay);
};

/**
 * removeRaw - Drops one entry now, and cancels any pending write for it.
 * @param {CacheArea} area Which storage to clear from.
 * @param {string} key The full key, prefix included.
 */
const removeRaw = (area: CacheArea, key: string) =>
{
    dirty.get(area)?.delete(key);

    const store = backend(area);

    if (store === undefined)
    {
        shim.delete(`${ area }:${ key }`);

        return;
    }

    try
    {
        store.removeItem(key);
    }
    catch
    {
        // Nothing useful to do; the entry ages out on its own TTL.
    }
};

/**
 * keysUnder - Every stored key carrying a prefix.
 * @param {CacheArea} area Which storage to enumerate.
 * @param {string} prefix The namespace to match.
 * @returns {string[]} The matching full keys.
 */
const keysUnder = (area: CacheArea, prefix: string) =>
{
    const found: string[] = [];

    const store = backend(area);

    if (store === undefined)
    {
        for (const key of shim.keys())
        {
            if (key.startsWith(`${ area }:${ prefix }`))
            {
                found.push(key.slice(area.length + 1));
            }
        }

        return found;
    }

    try
    {
        for (let index = 0; index < store.length; index += 1)
        {
            const key = store.key(index);

            if (key?.startsWith(prefix) === true)
            {
                found.push(key);
            }
        }
    }
    catch
    {
        return found;
    }

    return found;
};

/**
 * prune - Keeps a namespace inside its bound, dropping the least recently written first.
 *
 * Sorted on a stamp read back out of each entry rather than on storage order, because storage order is
 * whatever the backend reports and it outlives the process that wrote it.
 * @param {CacheArea} area Which storage to bound.
 * @param {string} prefix The namespace to bound.
 * @param {number} keep How many entries may remain.
 * @param {(raw: string) => number} stampOf Reads the sort stamp out of a stored payload.
 */
export const prune = (area: CacheArea, prefix: string, keep: number, stampOf: (raw: string) => number) =>
{
    const keys = keysUnder(area, prefix);

    if (keys.length <= keep)
    {
        return;
    }

    const ranked = keys.map((key) => ({ key, stamp: stampOf(readRaw(area, key) ?? '') }));

    ranked.sort((left, right) => left.stamp - right.stamp);

    for (const item of ranked.slice(0, keys.length - keep))
    {
        removeRaw(area, item.key);

        cacheLog('evict', item.key);
    }
};

/**
 * clearUnder - Drops every entry in a namespace, optionally filtered.
 * @param {CacheArea} area Which storage to clear.
 * @param {string} prefix The namespace to clear.
 * @param {(key: string) => boolean} [match] Which keys to drop, given the key without its prefix.
 */
export const clearUnder = (area: CacheArea, prefix: string, match?: (key: string) => boolean) =>
{
    for (const key of keysUnder(area, prefix))
    {
        if (match === undefined || match(key.slice(prefix.length)))
        {
            removeRaw(area, key);

            cacheLog('invalidate', key);
        }
    }
};
