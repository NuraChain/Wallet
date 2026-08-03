import { getValue, removeValue, setValue } from '../utility/storage';

/**
 * Navigation state the Android bridge pushes back after every page event.
 */
export interface BrowserState { url: string; title: string; canBack: boolean; canForward: boolean; loading: boolean; progress: number }

/**
 * Which layout the browser asks sites for. Sniffing is done on the user agent, so this is the one
 * string that decides it on both platforms.
 */
export type BrowserView = 'mobile' | 'desktop';

/**
 * One entry in the visited list: where it went and when it was last opened.
 */
export interface BrowserVisit { url: string; time: number }

/**
 * A site offered on the start screen.
 *
 * `explorer` marks the one entry whose address is not fixed — it follows the active network, so the
 * row points at Blockscout on Nura and Etherscan on Ethereum rather than at a chain the user is not
 * currently on. It is dropped from the list on a network that declares no explorer.
 */
export interface SuggestedSite { name: string; url: string; explorer: boolean }

/**
 * The start screen's suggested sites, in the order they are shown.
 *
 * PLACEHOLDER ADDRESSES: three of these four are `example.com` stand-ins waiting for the real ones —
 * the names are what was asked for, the destinations are not known here. Replace the `url` fields
 * below and nothing else has to change. `Explorer` is the exception and is already real: it resolves
 * against the active network at render.
 */
export const suggestedSites: SuggestedSite[] =
[
    { name: 'AuctionHouse', url: 'https://example.com/auction-house', explorer: false },
    { name: 'Explorer', url: '', explorer: true },
    { name: 'Fast Gold', url: 'https://example.com/fast-gold', explorer: false },
    { name: 'Swap Dex', url: 'https://example.com/swap-dex', explorer: false }
];

/**
 * How many visits are kept. Old enough entries stop being a shortcut and start being a record of
 * where someone has been, which is not what this list is for.
 */
const historyLimit = 40;

/**
 * getSiteHost - Names a page by its host, since that is the part someone recognises.
 *
 * `www.` is dropped for the same reason a browser's address bar drops it, and anything that will not
 * parse falls back to the address as given rather than to nothing.
 * @param {string} url An absolute URL.
 * @returns {string} The host, or the input when it is not parseable.
 */
export const getSiteHost = (url: string) =>
{
    try
    {
        return new URL(url).host.replace(/^www\./u, '');
    }
    catch
    {
        return url;
    }
};

/**
 * getSiteIcon - Where a site's own icon lives.
 *
 * Asked of the site itself rather than of an icon service. A service would answer for every host in
 * one round trip and with better artwork, but it would also be told every site in this list — one
 * party learning the browsing history of a wallet is exactly the trade this app does not make. The
 * site is contacted instead, which is a host the user has already been to.
 *
 * `/favicon.ico` is the path every browser falls back to, so it is the one that needs no page parse.
 * A site that answers with something else simply fails to load, and `TokenIcon` shows its letter.
 * @param {string} url An absolute URL.
 * @returns {string} The icon URL, or an empty string when the address will not parse.
 */
export const getSiteIcon = (url: string) =>
{
    try
    {
        return new URL('/favicon.ico', url).href;
    }
    catch
    {
        return '';
    }
};

/**
 * getBrowserView - The layout sites are asked for, as last chosen.
 *
 * Defaults to `mobile`: the window is phone-shaped on both platforms, and a desktop layout in a
 * 360px column is the thing the default user agent already had to work around.
 * @returns {Promise<BrowserView>} The stored view, or `mobile`.
 */
export const getBrowserView = async(): Promise<BrowserView> =>
{
    const stored = await getValue('Browser.View');

    return stored === 'desktop' ? 'desktop' : 'mobile';
};

/**
 * setBrowserView - Remembers the layout sites should be asked for.
 * @param {BrowserView} view The view to store.
 * @returns {Promise<void>} Resolves once written.
 */
export const setBrowserView = async(view: BrowserView) => setValue('Browser.View', view);

/**
 * getBrowserHistory - The sites opened from this tab, newest first.
 *
 * Anything that does not parse as the list it wrote is treated as no history at all rather than
 * thrown, since a shortcut list is not worth failing a page load over.
 * @returns {Promise<BrowserVisit[]>} The stored visits, or an empty list.
 */
export const getBrowserHistory = async(): Promise<BrowserVisit[]> =>
{
    const stored = await getValue('Browser.History');

    if (stored === undefined)
    {
        return [];
    }

    try
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(stored) as BrowserVisit[];

        if (!Array.isArray(parsed))
        {
            return [];
        }

        return parsed.filter((item) => typeof item?.url === 'string' && item.url.length > 0 && typeof item.time === 'number');
    }
    catch
    {
        return [];
    }
};

/**
 * addBrowserVisit - Records a page as the newest visit and returns the updated list.
 *
 * A site opened again moves to the front rather than appearing twice, so the list stays a set of
 * places rather than a log of trips. This is written in plaintext, like the theme and the language —
 * it is not key material, but it is a record of browsing, which is why `clearBrowserHistory` exists.
 * @param {string} url The page that was opened.
 * @returns {Promise<BrowserVisit[]>} The list as it now stands, newest first.
 */
export const addBrowserVisit = async(url: string): Promise<BrowserVisit[]> =>
{
    const current = await getBrowserHistory();

    const next = [ { url, time: Date.now() }, ...current.filter((item) => item.url !== url) ].slice(0, historyLimit);

    await setValue('Browser.History', JSON.stringify(next));

    return next;
};

/**
 * clearBrowserHistory - Forgets every visit.
 *
 * The key is removed rather than set to an empty list, so nothing is left behind to read.
 * @returns {Promise<void>} Resolves once the key is gone.
 */
export const clearBrowserHistory = async() => removeValue('Browser.History');

/**
 * The Kotlin side of the native browser, injected as `__nuraBrowser` on the app's own webview only.
 *
 * Coordinates are CSS pixels; the bridge converts them to device pixels itself.
 */
interface BrowserBridge {
    open: (url: string, x: number, y: number, width: number, height: number) => void;
    setBounds: (x: number, y: number, width: number, height: number) => void;
    close: () => void;
    reload: () => void;
    back: () => void;
    forward: () => void;

    /**
     * Optional because the bridge lives in the installed APK while this file ships in the bundle: an
     * app updated over the air can be newer than the Kotlin beside it, and a missing desktop toggle
     * should leave the browser on its default layout rather than throw on the call.
     */
    setDesktop?: (desktop: boolean) => void;

    /**
     * Hides the page without discarding it, so leaving the tab and coming back resumes what was open.
     *
     * Optional for the same reason as `setDesktop`, and the fallback matters more here: against an
     * older APK that cannot hide, the view has to be closed on the way out — it is painted over the
     * layout and would otherwise cover the wallet tab.
     */
    setVisible?: (visible: boolean) => void;
}

declare global
{
    interface Window
    {
        __nuraBrowser?: BrowserBridge;
        __nuraBrowserState?: (state: BrowserState) => void;
    }
}

/**
 * getNativeBrowser - The Android bridge, when this build is running on one.
 *
 * Tauri's child-webview API is desktop only, so Android needs a real `android.webkit.WebView` driven
 * from Kotlin instead. Everywhere else this is `undefined` and callers fall back to the child webview.
 * @returns {BrowserBridge | undefined} The bridge, or `undefined` off Android.
 */
export const getNativeBrowser = () => window.__nuraBrowser;

/**
 * onNativeBrowserState - Subscribes to navigation updates from the native browser.
 *
 * Only one listener is meaningful because the bridge calls a single well-known global, so registering
 * replaces whatever was there; the returned function clears it again.
 * @param {(state: BrowserState) => void} listener Receives every navigation update.
 * @returns {() => void} Removes the listener.
 */
export const onNativeBrowserState = (listener: (state: BrowserState) => void) =>
{
    window.__nuraBrowserState = listener;

    return () =>
    {
        if (window.__nuraBrowserState === listener)
        {
            window.__nuraBrowserState = undefined;
        }
    };
};
