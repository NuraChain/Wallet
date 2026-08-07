import { isTauri } from '@tauri-apps/api/core';

/**
 * requestPersistence - Asks the browser to stop treating this origin's storage as disposable.
 *
 * Without it, script-writable storage — which is where the encrypted mnemonic lives — is evictable.
 * WebKit deletes it after seven days of browser use without interaction on the site, and every engine
 * will drop it under disk pressure, least recently used first. For a wallet that is not a cache miss,
 * it is a lost wallet.
 *
 * `persist()` is the documented way out: quota eviction skips origins that have been granted it, and
 * the grant is permanent rather than something that has to be renewed. It is a request, not a command,
 * and each engine decides on its own heuristics — Safari's include whether the page is running as a
 * home screen web app, and Chrome's include being installed. So this is asked on every launch rather
 * than once: a first visit in a browser tab is usually refused, and the same call succeeds after the
 * user installs the app, which is exactly when there is something worth keeping.
 *
 * Asked for on every platform, not just the web build. The desktop and Android builds keep the wallet
 * in the Tauri store, which is an ordinary file and was never evictable — but the image cache is in the
 * origin private file system on all of them, and that is.
 * @returns {Promise<boolean>} Whether storage is persistent now, by grant or from before.
 */
export const requestPersistence = async(): Promise<boolean> =>
{
    // Feature-detected rather than assumed: the API is absent in older WebKit, and asking for it there
    // should leave the app exactly as it was rather than throwing during startup.
    if (typeof navigator.storage?.persist !== 'function')
    {
        return false;
    }

    try
    {
        // Asking again when it has already been granted would spend a prompt on some engines for an
        // answer that cannot change.
        if (await navigator.storage.persisted())
        {
            return true;
        }

        return await navigator.storage.persist();
    }
    catch
    {
        return false;
    }
};

/**
 * initOffline - Puts the web build's service worker in place, and keeps it out of every other build.
 *
 * The worker is what lets the installed web app open with no network: it holds the document and the
 * hashed assets, and nothing else. It is wanted only there.
 *
 * **Inside Tauri this actively unregisters instead.** Refusing to register would not be enough on its
 * own, because `tauri.conf.json` points the dev build at `http://localhost:1420` — the same origin the
 * browser preview runs on. A worker registered by a browser session on that port would otherwise still
 * be controlling the desktop window the next time `npm run desktop` opens it, serving the assets it
 * cached rather than the ones the app was built with. Desktop, Linux and Android all load their assets
 * from the bundle and must keep doing exactly that.
 *
 * Production only, for the same reason in reverse: a worker in front of the dev server caches the very
 * files hot reload is trying to replace.
 * @returns {void} Nothing; failures are deliberately silent, since offline support is an enhancement.
 */
export const initOffline = () =>
{
    // Independent of the worker and of the platform: what it protects is the stored wallet, which every
    // build has, and it is refused far more often than it is granted so it is worth asking every time.
    void requestPersistence();

    if (!('serviceWorker' in navigator))
    {
        return;
    }

    if (isTauri())
    {
        void navigator.serviceWorker.getRegistrations()
            .then(async(registrations) => Promise.all(registrations.map(async(item) => item.unregister())))
            .catch(() => undefined);

        return;
    }

    if (!import.meta.env.PROD)
    {
        return;
    }

    // The version rides along in the query string so the worker can name its caches after it, and so a
    // release changes this URL — which is what prompts the browser to fetch the file and compare it.
    void navigator.serviceWorker.register(`/sw.js?v=${ __APP_VERSION__ }`, { scope: '/' }).catch(() => undefined);
};
