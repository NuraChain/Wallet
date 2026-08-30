import { clearUnder, keysUnder, prune, readRaw, removeRaw, writeRaw } from './cache.store';

export type ImageKind = 'network' | 'token' | 'nft' | 'unknown';

const day = 24 * 60 * 60 * 1000;

const lifetime: Record<ImageKind, number> = {
    network: 30 * day,
    token: 7 * day,
    nft: 7 * day,
    unknown: 7 * day
};

interface CacheEntry {
    url: string;
    hash: string;
    file: string;

    kind?: ImageKind;
    etag: string;
    modified: string;
    expires: number;
    size: number;
    mime: string;
    used: number;
}

const maxBytes = 64 * 1024 * 1024;

const maxFileBytes = 4 * 1024 * 1024;

const maxMemory = 120;

const maxParallel = 6;

const maxAttempts = 3;
const backoffBase = 500;

const blockedCooldown = 24 * 60 * 60 * 1000;
const failureCooldown = 5 * 60 * 1000;

class Unreadable extends Error {
    public readonly reason: unknown;

    public constructor(reason: unknown) {
        super('image could not be read');

        this.name = 'Unreadable';

        this.reason = reason;
    }
}

const blockedPrefix = 'image-cache/v1/blocked/';

const blockedKey = (kind: ImageKind, url: string) => `${blockedPrefix}${kind}/${url}`;

const blockedScope = (kind?: ImageKind) => {
    if (kind === undefined) {
        return blockedPrefix;
    }

    return `${blockedPrefix}${kind}/`;
};

const liveBlocks = (kind?: ImageKind) => {
    const now = Date.now();

    return keysUnder('local', blockedScope(kind)).filter((key) => Number(readRaw('local', key) ?? '0') > now);
};

const maxBlocked = 200;

const cacheDirectory = 'image-cache';
const metaFile = 'metadata.json';

const extensions: Record<string, string | undefined> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/svg+xml': '.svg',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
    'image/bmp': '.bmp'
};

const signatures: { mime: string; bytes: number[] }[] = [
    { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
    { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
    { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
    { mime: 'image/bmp', bytes: [0x42, 0x4d] },
    { mime: 'image/x-icon', bytes: [0x00, 0x00, 0x01, 0x00] }
];

const memory = new Map<string, string>();

const inflight = new Map<string, Promise<string>>();

const cooldown = new Map<string, number>();

let entries = new Map<string, CacheEntry>();
let running = 0;
const waiting: (() => void)[] = [];
let ready: Promise<void> | undefined;
let opening: Promise<FileSystemDirectoryHandle | undefined> | undefined;
let saving = 0;

const hashUrl = async (url: string) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));

    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const openStore = async () => {
    opening ??= (async () => {
        try {
            const root = await navigator.storage.getDirectory();

            return await root.getDirectoryHandle(cacheDirectory, { create: true });
        } catch {
            return undefined;
        }
    })();

    return opening;
};

const readMeta = async (directory: FileSystemDirectoryHandle) => {
    const found = new Map<string, CacheEntry>();

    try {
        const handle = await directory.getFileHandle(metaFile);
        const text = await (await handle.getFile()).text();

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(text) as CacheEntry[];

        if (!Array.isArray(parsed)) {
            return found;
        }

        for (const item of parsed) {
            if (typeof item?.url === 'string' && typeof item.file === 'string' && typeof item.size === 'number') {
                found.set(item.url, item);
            }
        }
    } catch {
        return found;
    }

    return found;
};

const writeMeta = async () => {
    const directory = await openStore();

    if (directory === undefined) {
        return;
    }

    saving += 1;

    const ticket = saving;

    await Promise.resolve();

    if (ticket !== saving) {
        return;
    }

    try {
        const handle = await directory.getFileHandle(metaFile, { create: true });
        const writable = await handle.createWritable();

        await writable.write(JSON.stringify([...entries.values()]));
        await writable.close();
    } catch {}
};

const dropFile = async (file: string) => {
    const directory = await openStore();

    try {
        await directory?.removeEntry(file);
    } catch {}
};

const evict = async () => {
    let total = 0;

    for (const entry of entries.values()) {
        total += entry.size;
    }

    if (total <= maxBytes) {
        return;
    }

    const ordered = [...entries.values()].sort((left, right) => left.used - right.used);

    for (const entry of ordered) {
        if (total <= maxBytes) {
            break;
        }

        entries.delete(entry.url);

        total -= entry.size;

        // oxlint-disable-next-line no-await-in-loop
        await dropFile(entry.file);
    }
};

const sweep = async () => {
    const directory = await openStore();

    if (directory === undefined) {
        return;
    }

    entries = await readMeta(directory);

    const present = new Set<string>();

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const listing = directory as unknown as { keys: () => AsyncIterable<string> };

        for await (const name of listing.keys()) {
            present.add(name);
        }
    } catch {
        return;
    }

    const now = Date.now();

    for (const entry of [...entries.values()]) {
        if (!present.has(entry.file)) {
            entries.delete(entry.url);
        }
    }

    const claimed = new Set([...entries.values()].map((entry) => entry.file));

    for (const name of present) {
        if (name !== metaFile && !claimed.has(name)) {
            // oxlint-disable-next-line no-await-in-loop
            await dropFile(name);
        }
    }

    for (const entry of [...entries.values()]) {
        if (now > entry.expires + lifetime.unknown) {
            entries.delete(entry.url);

            // oxlint-disable-next-line no-await-in-loop
            await dropFile(entry.file);
        }
    }

    await evict();
    await writeMeta();
};

const start = async () => {
    ready ??= sweep().catch(() => undefined);

    return ready;
};

const remember = (url: string, object: string) => {
    memory.delete(url);
    memory.set(url, object);

    while (memory.size > maxMemory) {
        const oldest = memory.keys().next();

        if (oldest.done === true) {
            break;
        }

        const stale = memory.get(oldest.value);

        memory.delete(oldest.value);

        if (stale !== undefined) {
            URL.revokeObjectURL(stale);
        }
    }
};

const forget = (url: string) => {
    const held = memory.get(url);

    if (held !== undefined) {
        URL.revokeObjectURL(held);

        memory.delete(url);
    }
};

const acquire = async () => {
    if (running < maxParallel) {
        running += 1;

        return;
    }

    await new Promise<void>((resolve) => {
        waiting.push(resolve);
    });

    running += 1;
};

const release = () => {
    running -= 1;

    waiting.shift()?.();
};

const accepts = (mime: string, bytes: Uint8Array) => {
    if (!mime.startsWith('image/')) {
        return false;
    }

    if (mime.startsWith('image/svg')) {
        return true;
    }

    return signatures.some((item) => item.bytes.every((byte, index) => bytes[index] === byte));
};

const download = async (url: string, known: CacheEntry | undefined) => {
    const headers = new Headers();

    if (known !== undefined && known.etag.length > 0) {
        headers.set('If-None-Match', known.etag);
    }

    if (known !== undefined && known.modified.length > 0) {
        headers.set('If-Modified-Since', known.modified);
    }

    const response = await fetch(url, { headers, redirect: 'follow' }).catch((cause: unknown) => {
        throw new Unreadable(cause);
    });

    if (response.status === 304) {
        return { mime: known?.mime ?? '', etag: known?.etag ?? '', modified: known?.modified ?? '', fresh: false };
    }

    if (!response.ok) {
        throw new Error(`image responded ${response.status}`);
    }

    const declared = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const length = Number(response.headers.get('content-length') ?? '0');

    if (Number.isFinite(length) && length > maxFileBytes) {
        throw new Error('image is larger than the cache accepts');
    }

    const buffer = await response.arrayBuffer();

    if (buffer.byteLength > maxFileBytes) {
        throw new Error('image is larger than the cache accepts');
    }

    if (!accepts(declared, new Uint8Array(buffer.slice(0, 8)))) {
        throw new Error('response is not an image');
    }

    return {
        blob: new Blob([buffer], { type: declared }),
        mime: declared,
        etag: response.headers.get('etag') ?? '',
        modified: response.headers.get('last-modified') ?? '',
        fresh: true
    };
};

const expiryFor = (kind: ImageKind, control: string) => {
    const age = /max-age\s*=\s*(?<seconds>\d+)/iu.exec(control)?.groups?.seconds;

    if (age !== undefined) {
        return Date.now() + Number(age) * 1000;
    }

    return Date.now() + lifetime[kind];
};

const keep = async (url: string, kind: ImageKind, blob: Blob, head: { mime: string; etag: string; modified: string; control: string }) => {
    const hash = await hashUrl(url);
    const file = `${hash}${extensions[head.mime] ?? ''}`;

    const directory = await openStore();

    if (directory !== undefined) {
        try {
            const handle = await directory.getFileHandle(file, { create: true });
            const writable = await handle.createWritable();

            await writable.write(blob);
            await writable.close();
        } catch {
            return;
        }
    }

    const previous = entries.get(url);

    if (previous !== undefined && previous.file !== file) {
        await dropFile(previous.file);
    }

    entries.set(url, {
        url,
        hash,
        file,
        kind,
        etag: head.etag,
        modified: head.modified,
        expires: expiryFor(kind, head.control),
        size: blob.size,
        mime: head.mime,
        used: Date.now()
    });

    await evict();
    await writeMeta();
};

const revalidated = async (url: string, kind: ImageKind, known: CacheEntry | undefined) => {
    if (known === undefined) {
        return;
    }

    entries.set(url, { ...known, kind, expires: Date.now() + lifetime[kind], used: Date.now() });

    await writeMeta();
};

const blockedUntil = (kind: ImageKind, url: string) => {
    const key = blockedKey(kind, url);

    const held = cooldown.get(key);

    if (held !== undefined) {
        return held;
    }

    const stored = Number(readRaw('local', key) ?? '0');

    if (!Number.isFinite(stored) || stored === 0) {
        return 0;
    }

    cooldown.set(key, stored);

    return stored;
};

const refusedBefore = (kind: ImageKind, url: string) => readRaw('local', blockedKey(kind, url)) !== undefined;

const blockUrl = (kind: ImageKind, url: string, span: number) => {
    const key = blockedKey(kind, url);
    const until = Date.now() + span;

    cooldown.set(key, until);

    writeRaw('local', key, String(until));

    prune('local', blockedPrefix, maxBlocked, (raw) => Number(raw) || 0);
};

const fetchInto = async (url: string, kind: ImageKind, known: CacheEntry | undefined): Promise<string> => {
    if (Date.now() < blockedUntil(kind, url)) {
        return '';
    }

    await acquire();

    try {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            try {
                // oxlint-disable-next-line no-await-in-loop
                const result = await download(url, known);

                if (!result.fresh || result.blob === undefined) {
                    // oxlint-disable-next-line no-await-in-loop
                    await revalidated(url, kind, known);

                    return '';
                }

                // oxlint-disable-next-line no-await-in-loop
                await keep(url, kind, result.blob, { mime: result.mime, etag: result.etag, modified: result.modified, control: '' });

                cooldown.delete(blockedKey(kind, url));

                removeRaw('local', blockedKey(kind, url));

                return URL.createObjectURL(result.blob);
            } catch (cause) {
                if (cause instanceof Unreadable) {
                    const settled = navigator.onLine && refusedBefore(kind, url);

                    blockUrl(kind, url, settled ? blockedCooldown : failureCooldown);

                    return '';
                }

                const last = attempt === maxAttempts - 1;

                if (last) {
                    blockUrl(kind, url, failureCooldown);

                    return '';
                }

                // oxlint-disable-next-line no-await-in-loop
                await new Promise((resolve) => {
                    setTimeout(resolve, backoffBase * 2 ** attempt + Math.floor(Math.random() * backoffBase));
                });
            }
        }

        return '';
    } finally {
        release();
    }
};

const readFile = async (entry: CacheEntry) => {
    const directory = await openStore();

    if (directory === undefined) {
        return '';
    }

    try {
        const handle = await directory.getFileHandle(entry.file);
        const file = await handle.getFile();

        if (file.size === 0) {
            throw new Error('empty file');
        }

        return URL.createObjectURL(file);
    } catch {
        entries.delete(entry.url);

        return '';
    }
};

const resolve = async (url: string, kind: ImageKind): Promise<string> => {
    await start();

    const held = memory.get(url);

    if (held !== undefined) {
        remember(url, held);

        return held;
    }

    const entry = entries.get(url);

    if (entry !== undefined) {
        const object = await readFile(entry);

        if (object.length > 0) {
            entries.set(url, { ...entry, used: Date.now() });

            remember(url, object);

            void writeMeta();

            if (Date.now() > entry.expires) {
                void fetchInto(url, kind, entry).then((fresh) => {
                    if (fresh.length > 0) {
                        remember(url, fresh);
                    }
                });
            }

            return object;
        }
    }

    const object = await fetchInto(url, kind, entry);

    if (object.length > 0) {
        remember(url, object);
    }

    return object;
};

export const imageCache = {
    get: async (url: string, kind: ImageKind = 'unknown'): Promise<string> => {
        if (url.length === 0) {
            return '';
        }

        if (!/^https?:\/\//iu.test(url)) {
            return url;
        }

        const pending = inflight.get(url);

        if (pending !== undefined) {
            return pending;
        }

        const task = resolve(url, kind)
            .catch(() => '')
            .finally(() => {
                inflight.delete(url);
            });

        inflight.set(url, task);

        return task;
    },

    prefetch: async (urls: string[], kind: ImageKind = 'unknown') => {
        await Promise.all(urls.map(async (url) => imageCache.get(url, kind).catch(() => '')));
    },

    remove: async (url: string) => {
        await start();

        forget(url);

        const entry = entries.get(url);

        if (entry !== undefined) {
            entries.delete(url);

            await dropFile(entry.file);
            await writeMeta();
        }
    },

    clear: async () => {
        await start();

        for (const object of memory.values()) {
            URL.revokeObjectURL(object);
        }

        memory.clear();
        cooldown.clear();

        clearUnder('local', blockedPrefix);

        for (const entry of [...entries.values()]) {
            // oxlint-disable-next-line no-await-in-loop
            await dropFile(entry.file);
        }

        entries = new Map();

        await writeMeta();
    },

    clearExpired: async () => {
        await start();

        const now = Date.now();

        let removed = 0;

        const stale = [...entries.values()].filter((entry) => now > entry.expires);

        for (const entry of stale) {
            entries.delete(entry.url);

            forget(entry.url);

            removed += 1;

            // oxlint-disable-next-line no-await-in-loop
            await dropFile(entry.file);
        }

        if (removed > 0) {
            await writeMeta();
        }

        return removed;
    },

    clearKind: async (kind: ImageKind) => {
        await start();

        const matching = [...entries.values()].filter((entry) => (entry.kind ?? 'unknown') === kind);

        for (const entry of matching) {
            entries.delete(entry.url);

            forget(entry.url);

            // oxlint-disable-next-line no-await-in-loop
            await dropFile(entry.file);
        }

        if (matching.length > 0) {
            await writeMeta();
        }

        const scope = blockedScope(kind);

        clearUnder('local', scope);

        for (const key of [...cooldown.keys()]) {
            if (key.startsWith(scope)) {
                cooldown.delete(key);
            }
        }

        return matching.length;
    },

    getCacheSize: async (kind?: ImageKind) => {
        await start();

        let bytes = 0;
        let count = 0;

        for (const entry of entries.values()) {
            if (kind !== undefined && (entry.kind ?? 'unknown') !== kind) {
                continue;
            }

            bytes += entry.size;
            count += 1;
        }

        return { bytes, count, blocked: liveBlocks(kind).length };
    }
};
