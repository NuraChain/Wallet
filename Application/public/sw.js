/*
 * The service worker behind the installed web app.
 *
 * Only ever reached by the web build: `core/offline.ts` refuses to register this inside Tauri and
 * unregisters anything it finds there, because the desktop and Android builds load their assets out of
 * the bundle and a worker holding an older copy would quietly serve it after an update.
 *
 * Not compiled — it lives in `public/` and ships byte for byte, which is why it is plain JavaScript and
 * why `public/` is outside the lint config.
 */

/*
 * The cache name carries the version the page registered with, so a new release lands in new caches
 * and the old ones are dropped on activate. The registering URL changes with it too, which is what
 * makes the browser go and look for this file again in the first place.
 */
const version = new URL(self.location.href).searchParams.get('v') ?? 'dev';

const shellCache = `nura-shell-${ version }`;
const assetCache = `nura-assets-${ version }`;

/* What has to be present for the app to start with no network at all. */
const shell = [ '/', '/manifest.webmanifest', '/icon.png' ];

self.addEventListener('install', (event) =>
{
    event.waitUntil((async () =>
    {
        const cache = await caches.open(shellCache);

        /*
         * Individually rather than through `addAll`, which rejects the whole install if any one entry
         * fails — an icon that 404s should not leave the app with no worker at all.
         */
        await Promise.all(shell.map(async (path) => cache.add(path).catch(() => undefined)));

        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) =>
{
    event.waitUntil((async () =>
    {
        const keys = await caches.keys();

        await Promise.all(keys
            .filter((key) => key.startsWith('nura-') && key !== shellCache && key !== assetCache)
            .map(async (key) => caches.delete(key)));

        await self.clients.claim();
    })());
});

/**
 * Serve from the network, falling back to what was cached.
 *
 * For the document itself: online it must be the newest one, because it names the hashed asset files
 * every other request depends on. Offline the last good copy is what makes the app open at all.
 * @param {Request} request The navigation request.
 * @returns {Promise<Response>} The document.
 */
const networkFirst = async (request) =>
{
    try
    {
        const response = await fetch(request);

        if (response.ok)
        {
            const cache = await caches.open(shellCache);

            await cache.put('/', response.clone());
        }

        return response;
    }
    catch
    {
        const cached = await caches.match('/', { cacheName: shellCache });

        return cached ?? Response.error();
    }
};

/**
 * Serve from the cache, falling back to the network and keeping what comes back.
 *
 * Safe for everything under `/assets/`, whose names carry a content hash: a file at a given name never
 * changes, so a hit is never stale and a new build simply asks for new names.
 * @param {Request} request The asset request.
 * @param {string} name Which cache to use.
 * @returns {Promise<Response>} The asset.
 */
const cacheFirst = async (request, name) =>
{
    const cached = await caches.match(request, { cacheName: name });

    if (cached)
    {
        return cached;
    }

    const response = await fetch(request);

    /* Only a complete, same-origin answer is worth keeping; an opaque or partial one is not. */
    if (response.ok && response.type === 'basic')
    {
        const cache = await caches.open(name);

        await cache.put(request, response.clone());
    }

    return response;
};

self.addEventListener('fetch', (event) =>
{
    const { request } = event;

    if (request.method !== 'GET')
    {
        return;
    }

    const url = new URL(request.url);

    /*
     * Everything off this origin is left entirely alone: the RPC endpoints, the block explorers, the
     * price API and the logo CDN. Those answers are live data, they already have their own caches in
     * `core/`, and a worker holding a copy of a balance response is exactly the stale figure the token
     * cache is written to avoid.
     */
    if (url.origin !== self.location.origin)
    {
        return;
    }

    if (request.mode === 'navigate')
    {
        event.respondWith(networkFirst(request));

        return;
    }

    event.respondWith(cacheFirst(request, url.pathname.startsWith('/assets/') ? assetCache : shellCache));
});
