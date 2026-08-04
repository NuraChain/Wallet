/**
 * How long a kind of image stays fresh.
 *
 * A network's logo effectively never changes, a token's rarely, an NFT's can change the day it is
 * minted. Anything unnamed is treated as a token, which is the middle of the three.
 */
export type ImageKind = 'network' | 'token' | 'nft' | 'unknown';

const day = 24 * 60 * 60 * 1000;

const lifetime: Record<ImageKind, number> =
{
    network: 30 * day,
    token: 7 * day,
    nft: 7 * day,
    unknown: 7 * day
};

/**
 * What is kept about one cached image, apart from the bytes themselves.
 *
 * `etag` and `modified` are what the server said last time, and they are what makes a refresh cheap:
 * sent back as `If-None-Match` and `If-Modified-Since`, an unchanged image answers 304 with no body.
 * `used` is the last read, which is what eviction sorts by.
 */
interface CacheEntry
{
    url: string;
    hash: string;
    file: string;
    etag: string;
    modified: string;
    expires: number;
    size: number;
    mime: string;
    used: number;
}

/**
 * Total bytes the cache is allowed on disk before the least recently used entries are dropped.
 *
 * Sized for what this app actually stores — coin logos and site icons, a few kilobytes each — rather
 * than for the hundreds of megabytes a photo cache would want. A wallet has no business holding that
 * much of anything it can re-download.
 */
const maxBytes = 64 * 1024 * 1024;

/** Largest single image accepted. Anything past this is not an icon and is refused. */
const maxFileBytes = 4 * 1024 * 1024;

/** How many object URLs are held in memory. Icons are small; this is a display cache, not the store. */
const maxMemory = 120;

/** How many downloads may be in flight at once. */
const maxParallel = 6;

/** Attempts per download, and the base of the delay between them. */
const maxAttempts = 3;
const backoffBase = 500;

/** How long a URL that failed every attempt is left alone before anything tries it again. */
const failureCooldown = 5 * 60 * 1000;

/** Where the files and the metadata live inside the origin private file system. */
const cacheDirectory = 'image-cache';
const metaFile = 'metadata.json';

/**
 * Extensions worth preserving, by MIME type.
 *
 * The extension is cosmetic — nothing reads the cache by name but this module — but a directory of
 * `.png` and `.svg` files is one a person can look at and understand, which a directory of extensionless
 * hashes is not.
 */
const extensions: Record<string, string | undefined> =
{
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

/**
 * The first bytes each accepted format starts with.
 *
 * The declared MIME type is the server's claim about the body; this is the body's own account of
 * itself. Both have to agree before anything is written, so a redirect to an HTML error page cannot be
 * stored as an icon and handed to an `<img>` forever after.
 */
const signatures: { mime: string; bytes: number[] }[] =
[
    { mime: 'image/png', bytes: [ 0x89, 0x50, 0x4E, 0x47 ] },
    { mime: 'image/jpeg', bytes: [ 0xFF, 0xD8, 0xFF ] },
    { mime: 'image/gif', bytes: [ 0x47, 0x49, 0x46, 0x38 ] },
    { mime: 'image/webp', bytes: [ 0x52, 0x49, 0x46, 0x46 ] },
    { mime: 'image/bmp', bytes: [ 0x42, 0x4D ] },
    { mime: 'image/x-icon', bytes: [ 0x00, 0x00, 0x01, 0x00 ] }
];

/** URL to object URL, in insertion order, which is what makes eviction least-recently-used. */
const memory = new Map<string, string>();

/** One download per URL, however many callers ask for it while it is running. */
const inflight = new Map<string, Promise<string>>();

/** URL to the time it may next be attempted, after every retry was spent. */
const cooldown = new Map<string, number>();

let entries = new Map<string, CacheEntry>();
let running = 0;
const waiting: (() => void)[] = [];
let ready: Promise<void> | undefined;
let opening: Promise<FileSystemDirectoryHandle | undefined> | undefined;
let saving = 0;

/**
 * hashUrl - The name a URL's bytes are filed under.
 *
 * SHA-256 of the URL, hex encoded. Deterministic, so the same address always resolves to the same
 * file, and safe as a filename by construction — a hash cannot contain a separator, a traversal or
 * anything else the surrounding directory would have to defend against.
 * @param {string} url The image address.
 * @returns {Promise<string>} Lowercase hex digest.
 */
const hashUrl = async(url: string) =>
{
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));

    return [ ...new Uint8Array(digest) ].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * openStore - The cache directory, or `undefined` where there is nowhere to put one.
 *
 * The origin private file system rather than the `fs` plugin, and deliberately. That plugin is not
 * compiled into the Android build at all and is scoped to the pictures and downloads folders on the
 * desktop ones, so a real cache directory would mean widening what a wallet can touch natively on
 * every platform. This is on disk, inside the app's own data directory, sandboxed so that a filename
 * cannot escape it, and identical on Windows, Linux and Android without granting anything.
 *
 * A webview too old to offer it — an older WebKitGTK, most likely — leaves the cache running from
 * memory alone, which costs a re-download per launch and nothing else.
 * @returns {Promise<FileSystemDirectoryHandle | undefined>} The directory, or `undefined`.
 */
const openStore = async() =>
{
    // The promise is what is cached rather than the handle: two callers arriving together then share
    // one attempt, and nothing is assigned to after an await.
    opening ??= (async() =>
    {
        try
        {
            const root = await navigator.storage.getDirectory();

            return await root.getDirectoryHandle(cacheDirectory, { create: true });
        }
        catch
        {
            return undefined;
        }
    })();

    return opening;
};

/**
 * readMeta - Loads the metadata index from disk.
 * @param {FileSystemDirectoryHandle} directory The cache directory.
 * @returns {Promise<Map<string, CacheEntry>>} Entries by URL, or an empty map.
 */
const readMeta = async(directory: FileSystemDirectoryHandle) =>
{
    const found = new Map<string, CacheEntry>();

    try
    {
        const handle = await directory.getFileHandle(metaFile);
        const text = await (await handle.getFile()).text();

        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(text) as CacheEntry[];

        if (!Array.isArray(parsed))
        {
            return found;
        }

        for (const item of parsed)
        {
            if (typeof item?.url === 'string' && typeof item.file === 'string' && typeof item.size === 'number')
            {
                found.set(item.url, item);
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
 * writeMeta - Persists the metadata index.
 *
 * Collapsed rather than queued: several entries usually change together — a sweep, a burst of icons —
 * and only the last state of the map is worth writing.
 * @returns {Promise<void>} Resolves once the write is done or superseded.
 */
const writeMeta = async() =>
{
    const directory = await openStore();

    if (directory === undefined)
    {
        return;
    }

    saving += 1;

    const ticket = saving;

    await Promise.resolve();

    if (ticket !== saving)
    {
        return;
    }

    try
    {
        const handle = await directory.getFileHandle(metaFile, { create: true });
        const writable = await handle.createWritable();

        await writable.write(JSON.stringify([ ...entries.values() ]));
        await writable.close();
    }
    catch
    {
        // a cache that cannot record itself still serves this session from memory
    }
};

/**
 * dropFile - Removes one image from disk, ignoring one that is already gone.
 * @param {string} file The stored filename.
 * @returns {Promise<void>} Resolves when it is no longer there.
 */
const dropFile = async(file: string) =>
{
    const directory = await openStore();

    try
    {
        await directory?.removeEntry(file);
    }
    catch
    {
        // already gone, which is the state being asked for
    }
};

/**
 * evict - Brings the cache back under its size limit, oldest use first.
 * @returns {Promise<void>} Resolves once enough has been removed.
 */
const evict = async() =>
{
    let total = 0;

    for (const entry of entries.values())
    {
        total += entry.size;
    }

    if (total <= maxBytes)
    {
        return;
    }

    const ordered = [ ...entries.values() ].sort((left, right) => left.used - right.used);

    for (const entry of ordered)
    {
        if (total <= maxBytes)
        {
            break;
        }

        entries.delete(entry.url);

        total -= entry.size;

        // eslint-disable-next-line no-await-in-loop
        await dropFile(entry.file);
    }
};

/**
 * sweep - Reconciles the index with what is actually on disk, and drops what is no longer wanted.
 *
 * Runs once per launch. Three things are removed: an entry whose file has gone, a file no entry claims
 * — both of which mean an interrupted write — and anything already past its lifetime. Whatever is left
 * is then held to the size limit.
 * @returns {Promise<void>} Resolves once the cache is consistent.
 */
const sweep = async() =>
{
    const directory = await openStore();

    if (directory === undefined)
    {
        return;
    }

    entries = await readMeta(directory);

    const present = new Set<string>();

    try
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const listing = directory as unknown as { keys: () => AsyncIterable<string> };

        for await (const name of listing.keys())
        {
            present.add(name);
        }
    }
    catch
    {
        // a directory that will not enumerate cannot be reconciled; the entries stand as recorded
        return;
    }

    const now = Date.now();

    for (const entry of [ ...entries.values() ])
    {
        if (!present.has(entry.file))
        {
            entries.delete(entry.url);
        }
    }

    const claimed = new Set([ ...entries.values() ].map((entry) => entry.file));

    for (const name of present)
    {
        if (name !== metaFile && !claimed.has(name))
        {
            // eslint-disable-next-line no-await-in-loop
            await dropFile(name);
        }
    }

    for (const entry of [ ...entries.values() ])
    {
        // Expiry alone is not a reason to delete: an expired image is still the best one available
        // until a fresh copy arrives. Only what has been untouched for a whole extra lifetime goes.
        if (now > entry.expires + lifetime.unknown)
        {
            entries.delete(entry.url);

            // eslint-disable-next-line no-await-in-loop
            await dropFile(entry.file);
        }
    }

    await evict();
    await writeMeta();
};

/**
 * start - Runs the launch sweep once, whoever asks first.
 * @returns {Promise<void>} Resolves when the cache is usable.
 */
const start = async() =>
{
    ready ??= sweep().catch(() => undefined);

    return ready;
};

/**
 * remember - Puts an object URL in the memory cache, evicting the least recently used.
 * @param {string} url The image address.
 * @param {string} object The object URL to hold.
 */
const remember = (url: string, object: string) =>
{
    memory.delete(url);
    memory.set(url, object);

    while (memory.size > maxMemory)
    {
        const oldest = memory.keys().next();

        if (oldest.done === true)
        {
            break;
        }

        const stale = memory.get(oldest.value);

        memory.delete(oldest.value);

        if (stale !== undefined)
        {
            URL.revokeObjectURL(stale);
        }
    }
};

/**
 * forget - Drops one address from the memory cache and releases its object URL.
 * @param {string} url The address to forget.
 */
const forget = (url: string) =>
{
    const held = memory.get(url);

    if (held !== undefined)
    {
        URL.revokeObjectURL(held);

        memory.delete(url);
    }
};

/**
 * acquire - Waits for a download slot.
 * @returns {Promise<void>} Resolves when the caller may proceed.
 */
const acquire = async() =>
{
    if (running < maxParallel)
    {
        running += 1;

        return;
    }

    await new Promise<void>((resolve) => { waiting.push(resolve); });

    running += 1;
};

/**
 * release - Hands the slot to whoever is next.
 */
const release = () =>
{
    running -= 1;

    waiting.shift()?.();
};

/**
 * accepts - Whether a body is an image this cache will store.
 *
 * Both the declared type and the leading bytes have to agree. SVG is the exception with no signature
 * to check — it is text — so it is taken on the header alone.
 * @param {string} mime The declared content type.
 * @param {Uint8Array} bytes The start of the body.
 * @returns {boolean} True when it is storable.
 */
const accepts = (mime: string, bytes: Uint8Array) =>
{
    if (!mime.startsWith('image/'))
    {
        return false;
    }

    if (mime.startsWith('image/svg'))
    {
        return true;
    }

    return signatures.some((item) => item.mime === mime && item.bytes.every((byte, index) => bytes[index] === byte));
};

/**
 * download - Fetches one image, conditionally when there is something to revalidate against.
 * @param {string} url The image address.
 * @param {CacheEntry | undefined} known What is already held, if anything.
 * @returns {Promise<{ blob?: Blob; mime: string; etag: string; modified: string; fresh: boolean }>} The body, or a note that it has not changed.
 * @throws {Error} When the response is unusable, which the caller retries.
 */
const download = async(url: string, known: CacheEntry | undefined) =>
{
    const headers = new Headers();

    if (known !== undefined && known.etag.length > 0)
    {
        headers.set('If-None-Match', known.etag);
    }

    if (known !== undefined && known.modified.length > 0)
    {
        headers.set('If-Modified-Since', known.modified);
    }

    const response = await fetch(url, { headers, redirect: 'follow' });

    if (response.status === 304)
    {
        return { mime: known?.mime ?? '', etag: known?.etag ?? '', modified: known?.modified ?? '', fresh: false };
    }

    if (!response.ok)
    {
        throw new Error(`image responded ${ response.status }`);
    }

    const declared = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const length = Number(response.headers.get('content-length') ?? '0');

    if (Number.isFinite(length) && length > maxFileBytes)
    {
        throw new Error('image is larger than the cache accepts');
    }

    const buffer = await response.arrayBuffer();

    if (buffer.byteLength > maxFileBytes)
    {
        throw new Error('image is larger than the cache accepts');
    }

    if (!accepts(declared, new Uint8Array(buffer.slice(0, 8))))
    {
        throw new Error('response is not an image');
    }

    return {
        blob: new Blob([ buffer ], { type: declared }),
        mime: declared,
        etag: response.headers.get('etag') ?? '',
        modified: response.headers.get('last-modified') ?? '',
        fresh: true
    };
};

/**
 * expiryFor - When a freshly fetched image should be looked at again.
 *
 * The server's own `max-age` wins where it gave one, since it knows better than a table of defaults;
 * the kind's lifetime is the fallback.
 * @param {ImageKind} kind What sort of image this is.
 * @param {string} control The `Cache-Control` header, if any.
 * @returns {number} Epoch milliseconds.
 */
const expiryFor = (kind: ImageKind, control: string) =>
{
    const age = (/max-age\s*=\s*(?<seconds>\d+)/iu).exec(control)?.groups?.seconds;

    if (age !== undefined)
    {
        return Date.now() + Number(age) * 1000;
    }

    return Date.now() + lifetime[kind];
};

/**
 * store one downloaded image and record it.
 * @param {string} url The image address.
 * @param {ImageKind} kind What sort of image it is.
 * @param {Blob} blob The bytes.
 * @param {{ mime: string; etag: string; modified: string; control: string }} head What the server said.
 * @returns {Promise<void>} Resolves once written and indexed.
 */
const keep = async(url: string, kind: ImageKind, blob: Blob, head: { mime: string; etag: string; modified: string; control: string }) =>
{
    const hash = await hashUrl(url);
    const file = `${ hash }${ extensions[head.mime] ?? '' }`;

    const directory = await openStore();

    if (directory !== undefined)
    {
        try
        {
            const handle = await directory.getFileHandle(file, { create: true });
            const writable = await handle.createWritable();

            await writable.write(blob);
            await writable.close();
        }
        catch
        {
            // no disk, no record: the object URL still serves this session
            return;
        }
    }

    const previous = entries.get(url);

    if (previous !== undefined && previous.file !== file)
    {
        await dropFile(previous.file);
    }

    entries.set(url, {
        url,
        hash,
        file,
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

/**
 * revalidated - Records that what is on disk is still current, after a 304.
 *
 * Its own step so the retry loop does not have to nest one more level to express it.
 * @param {string} url The image address.
 * @param {ImageKind} kind What sort of image it is.
 * @param {CacheEntry | undefined} known The entry the server confirmed.
 * @returns {Promise<void>} Resolves once the dates are written.
 */
const revalidated = async(url: string, kind: ImageKind, known: CacheEntry | undefined) =>
{
    if (known === undefined)
    {
        return;
    }

    entries.set(url, { ...known, expires: Date.now() + lifetime[kind], used: Date.now() });

    await writeMeta();
};

/**
 * fetchInto - Downloads with retries and stores the result.
 * @param {string} url The image address.
 * @param {ImageKind} kind What sort of image it is.
 * @param {CacheEntry | undefined} known What is already held, if anything.
 * @returns {Promise<string>} An object URL, or an empty string when every attempt failed.
 */
const fetchInto = async(url: string, kind: ImageKind, known: CacheEntry | undefined): Promise<string> =>
{
    const until = cooldown.get(url) ?? 0;

    if (Date.now() < until)
    {
        return '';
    }

    await acquire();

    try
    {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1)
        {
            try
            {
                // eslint-disable-next-line no-await-in-loop
                const result = await download(url, known);

                if (!result.fresh || result.blob === undefined)
                {
                    // 304: the bytes on disk are still current, so only the dates move.
                    // eslint-disable-next-line no-await-in-loop
                    await revalidated(url, kind, known);

                    return '';
                }

                // eslint-disable-next-line no-await-in-loop
                await keep(url, kind, result.blob, { mime: result.mime, etag: result.etag, modified: result.modified, control: '' });

                cooldown.delete(url);

                return URL.createObjectURL(result.blob);
            }
            catch
            {
                const last = attempt === maxAttempts - 1;

                if (last)
                {
                    // Backing off entirely rather than trying again on the next render: a missing icon
                    // is asked for by every row that shows it, and without this the failure repeats at
                    // the speed of the list.
                    cooldown.set(url, Date.now() + failureCooldown);

                    return '';
                }

                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => { setTimeout(resolve, backoffBase * 2 ** attempt + Math.floor(Math.random() * backoffBase)); });
            }
        }

        return '';
    }
    finally
    {
        release();
    }
};

/**
 * readFile - The bytes already on disk for one entry, as an object URL.
 * @param {CacheEntry} entry The entry to read.
 * @returns {Promise<string>} An object URL, or an empty string when the file has gone.
 */
const readFile = async(entry: CacheEntry) =>
{
    const directory = await openStore();

    if (directory === undefined)
    {
        return '';
    }

    try
    {
        const handle = await directory.getFileHandle(entry.file);
        const file = await handle.getFile();

        if (file.size === 0)
        {
            throw new Error('empty file');
        }

        return URL.createObjectURL(file);
    }
    catch
    {
        // The record and the disk disagree, so the record is the one that is wrong.
        entries.delete(entry.url);

        return '';
    }
};

/**
 * resolve - The whole lookup: memory, then disk, then the network.
 * @param {string} url The image address.
 * @param {ImageKind} kind What sort of image it is.
 * @returns {Promise<string>} A URL to display, or an empty string when there is nothing to show.
 */
const resolve = async(url: string, kind: ImageKind): Promise<string> =>
{
    await start();

    const held = memory.get(url);

    if (held !== undefined)
    {
        remember(url, held);

        return held;
    }

    const entry = entries.get(url);

    if (entry !== undefined)
    {
        const object = await readFile(entry);

        if (object.length > 0)
        {
            entries.set(url, { ...entry, used: Date.now() });

            remember(url, object);

            void writeMeta();

            // Stale but serviceable: the caller gets this now and a fresh copy lands in the cache for
            // next time. A refresh that fails changes nothing, which is the point of doing it after.
            if (Date.now() > entry.expires)
            {
                void fetchInto(url, kind, entry).then((fresh) =>
                {
                    if (fresh.length > 0)
                    {
                        remember(url, fresh);
                    }
                });
            }

            return object;
        }
    }

    const object = await fetchInto(url, kind, entry);

    if (object.length > 0)
    {
        remember(url, object);
    }

    return object;
};

/**
 * The one place in the app that downloads a remote image.
 *
 * Every icon — coin, token, site, and whatever is added next — comes through `get`, which answers from
 * memory if it can, from disk if it has it, and from the network only when it must. Callers get a URL
 * they can put in an `img` and nothing else to think about.
 */
export const imageCache =
{
    /**
     * get - A displayable URL for a remote image.
     *
     * Only `http` and `https` are fetched. Anything else — a `data:` URL, a bundled asset, an empty
     * string — is handed straight back, so a caller can pass whatever it has without checking first.
     *
     * Concurrent callers for one address share a single download rather than starting one each.
     * @param {string} url The image address.
     * @param {ImageKind} [kind] What sort of image it is, which sets how long it stays fresh.
     * @returns {Promise<string>} A URL to display, or an empty string when there is nothing to show.
     */
    get: async(url: string, kind: ImageKind = 'unknown'): Promise<string> =>
    {
        if (url.length === 0)
        {
            return '';
        }

        if (!(/^https?:\/\//iu).test(url))
        {
            return url;
        }

        const pending = inflight.get(url);

        if (pending !== undefined)
        {
            return pending;
        }

        const task = resolve(url, kind).catch(() => '').finally(() => { inflight.delete(url); });

        inflight.set(url, task);

        return task;
    },

    /**
     * prefetch - Warms the cache for images that are about to be shown.
     *
     * Failures are ignored: nothing is waiting on these, and the real request will retry.
     * @param {string[]} urls The addresses to fetch.
     * @param {ImageKind} [kind] What sort of images they are.
     * @returns {Promise<void>} Resolves once every one has settled.
     */
    prefetch: async(urls: string[], kind: ImageKind = 'unknown') =>
    {
        await Promise.all(urls.map(async(url) => imageCache.get(url, kind).catch(() => '')));
    },

    /**
     * remove - Forgets one image, in memory and on disk.
     * @param {string} url The address to forget.
     * @returns {Promise<void>} Resolves once it is gone.
     */
    remove: async(url: string) =>
    {
        await start();

        forget(url);

        const entry = entries.get(url);

        if (entry !== undefined)
        {
            entries.delete(url);

            await dropFile(entry.file);
            await writeMeta();
        }
    },

    /**
     * clear - Empties the cache completely.
     * @returns {Promise<void>} Resolves once nothing is left.
     */
    clear: async() =>
    {
        await start();

        for (const object of memory.values())
        {
            URL.revokeObjectURL(object);
        }

        memory.clear();
        cooldown.clear();

        for (const entry of [ ...entries.values() ])
        {
            // eslint-disable-next-line no-await-in-loop
            await dropFile(entry.file);
        }

        entries = new Map();

        await writeMeta();
    },

    /**
     * clearExpired - Drops everything past its lifetime.
     *
     * Deliberate, unlike the launch sweep, which keeps an expired image around as the best copy it has
     * until a newer one arrives. Asked for directly, expired means gone.
     * @returns {Promise<number>} How many entries were removed.
     */
    clearExpired: async() =>
    {
        await start();

        const now = Date.now();

        let removed = 0;

        const stale = [ ...entries.values() ].filter((entry) => now > entry.expires);

        for (const entry of stale)
        {
            entries.delete(entry.url);

            forget(entry.url);

            removed += 1;

            // eslint-disable-next-line no-await-in-loop
            await dropFile(entry.file);
        }

        if (removed > 0)
        {
            await writeMeta();
        }

        return removed;
    },

    /**
     * getCacheSize - How much disk the cache is using.
     * @returns {Promise<{ bytes: number; count: number }>} Total bytes and number of images.
     */
    getCacheSize: async() =>
    {
        await start();

        let bytes = 0;

        for (const entry of entries.values())
        {
            bytes += entry.size;
        }

        return { bytes, count: entries.size };
    }
};
