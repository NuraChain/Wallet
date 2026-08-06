import { getValue, removeValue, setValue } from '../utility/storage';

/**
 * Navigation state the Android bridge pushes back after every page event.
 *
 * `id` names the tab the update belongs to. It is absent from an APK that predates tabs, which only
 * ever had one page to report on — the listener attributes those to whichever tab is in front.
 */
export interface BrowserState { id?: string; url: string; title: string; canBack: boolean; canForward: boolean; loading: boolean; progress: number }

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
 * One open tab.
 *
 * Everything the toolbar reads is per-tab, so it all lives here rather than beside the tab list:
 * `entries` and `index` are that tab's own back/forward stack, `draft` is what its address bar holds,
 * and `reload` is the ticket its view watches. `id` is assigned once and never reused, which is what
 * lets it name a child webview and survive its neighbours being closed.
 *
 * `home` is the start screen shown over a tab that still has a page. It is separate from having no
 * address because the page underneath is kept alive and returned to — going home used to clear the
 * stack, which discarded the view and made the trip one-way.
 */
export interface BrowserTab { id: number; entries: string[]; index: number; draft: string; reload: number; home: boolean }

/**
 * atBrowserStart - Whether a tab is showing the start screen rather than a page.
 *
 * True either because the tab has never been given an address or because it was sent home. Both the
 * frame and the tab strip read this, and they have to agree: the strip belongs to the start screen, so
 * it is on screen exactly when the start screen is.
 * @param {BrowserTab} tab The tab to test.
 * @returns {boolean} True when the start screen is what that tab shows.
 */
export const atBrowserStart = (tab: BrowserTab) => tab.home || tab.index < 0;

/**
 * frameLabel - Names the view belonging to a tab.
 *
 * One label, one webview: two tabs sharing a label would tear down each other's page, so the id is
 * what keeps them apart. It doubles as the tab id the Android bridge is addressed by.
 * @param {number} id The tab id.
 * @returns {string} The label for that tab's view.
 */
export const frameLabel = (id: number) => `nura-browser-${ id }`;

/**
 * A shortcut the user keeps.
 *
 * The id is what edits and removals address, rather than the URL: the URL is the field most likely to
 * be the one being changed, and a list keyed on the thing being edited loses track of the row halfway
 * through the edit.
 */
export interface BrowserFavorite { id: string; name: string; url: string }

/**
 * The favourites a wallet starts with, in the order they are shown.
 *
 * There is one shortcut list on the start screen and this is what fills it. A separate row of fixed
 * "suggestions" sat above it and said the same thing twice — a shortcut someone can change and a
 * shortcut someone cannot are not two categories worth two headings, and the second one only meant
 * "the ones you may not touch".
 *
 * So they are seeded, not fixed: everything here can be renamed, re-aimed or removed, and the stored
 * list is what is shown from then on. The names are written rather than translated, because they name
 * products rather than describe them.
 *
 * The one shortcut not in this list is the active network's explorer, which cannot be: it has no fixed
 * address to store. It follows the chain and the account, and the start screen puts it at the head of
 * the same grid.
 */
const defaultFavorites: BrowserFavorite[] =
[
    { id: 'swap', name: 'Swap', url: 'https://swap.nurachain.net' },
    { id: 'google', name: 'Google', url: 'https://google.com' },
    { id: 'market', name: 'Poly Market', url: 'https://market.nurachain.net' },
    { id: 'github', name: 'GitHub', url: 'https://github.com/NuraChain/Explorer' },
    { id: 'discord', name: 'Discord', url: 'https://discord.gg/ykW3PU64h9' },
    { id: 'telegram', name: 'Telegram', url: 'https://t.me/nurachain' }
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
 * getBrowserFavorites - The kept shortcuts, in the order they are shown.
 *
 * A missing key means the wallet has never touched this list, so it gets the seed. A stored empty list
 * is a different thing and is honoured: someone who removed every favourite is not asking for them
 * back on the next launch.
 *
 * Anything that does not parse as the list it wrote is treated as no list at all, matching the history
 * reader — a shortcut grid is not worth failing the start screen over.
 * @returns {Promise<BrowserFavorite[]>} The stored favourites, or the seeded ones.
 */
export const getBrowserFavorites = async(): Promise<BrowserFavorite[]> =>
{
    const stored = await getValue('Browser.Favorites');

    if (stored === undefined)
    {
        return defaultFavorites;
    }

    try
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(stored) as BrowserFavorite[];

        if (!Array.isArray(parsed))
        {
            return [];
        }

        return parsed.filter((item) => typeof item?.id === 'string' && typeof item.name === 'string' && typeof item.url === 'string' && item.url.length > 0);
    }
    catch
    {
        return [];
    }
};

/**
 * setBrowserFavorites - Writes the kept shortcuts.
 * @param {BrowserFavorite[]} list The list to store, in display order.
 * @returns {Promise<void>} Resolves once written.
 */
export const setBrowserFavorites = async(list: BrowserFavorite[]) => setValue('Browser.Favorites', JSON.stringify(list));

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

    /**
     * The same operations again, each naming which page it means.
     *
     * Separate names rather than extra arguments on the ones above: the bridge is matched by name and
     * arity across the JavascriptInterface boundary, so widening a signature would break a bundle
     * running against the APK that shipped the narrow one. A build with these is a build that can hold
     * more than one page at a time; a build without them gets the single-page path, where only the
     * frontmost tab owns a view and the rest are addresses waiting to be reopened.
     */
    openTab?: (id: string, url: string, visible: boolean, x: number, y: number, width: number, height: number) => void;
    boundsTab?: (id: string, x: number, y: number, width: number, height: number) => void;
    closeTab?: (id: string) => void;
    visibleTab?: (id: string, visible: boolean) => void;
    reloadTab?: (id: string) => void;
    backTab?: (id: string) => void;
    forwardTab?: (id: string) => void;
}

/**
 * One tab's worth of the native browser, with the compatibility question already answered.
 *
 * `hides` is what the caller has to branch on: a view that cannot be hidden has to be closed when it
 * leaves the screen, because it is painted over the layout rather than inside it.
 */
export interface NativeTab {
    /**
     * `visible` is stated at open time rather than left to a follow-up call: a tab can be given an
     * address while another one is in front, and a page that appears first and is hidden afterwards
     * is a page that flashes over the tab the user is actually looking at.
     */
    open: (url: string, visible: boolean, x: number, y: number, width: number, height: number) => void;
    setBounds: (x: number, y: number, width: number, height: number) => void;
    close: () => void;
    setVisible: (visible: boolean) => void;
    reload: () => void;
    back: () => void;
    forward: () => void;
    hides: boolean;
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
 * nativeHoldsTabs - Whether the installed bridge can hold more than one page at once.
 *
 * Off Android this is `false` and means nothing: the desktop path gives every tab its own child
 * webview and never asks.
 * @returns {boolean} True when the tab-aware bridge methods are present.
 */
export const nativeHoldsTabs = () => window.__nuraBrowser?.openTab !== undefined;

/**
 * getNativeTab - The bridge as one tab sees it.
 *
 * Every call site works in terms of a single page it owns, so the choice between the tab-aware methods
 * and the single-page ones is made once, here, rather than at each of the seven places that drive a
 * view. Against a bridge without tabs each facade addresses the one page the APK can hold — which is
 * why the caller must keep all but the frontmost tab closed there.
 * @param {string} id Identifies the tab; the frame's webview label is used, so it is unique per tab.
 * @returns {NativeTab | undefined} The facade, or `undefined` off Android.
 */
export const getNativeTab = (id: string): NativeTab | undefined =>
{
    const bridge = window.__nuraBrowser;

    if (bridge === undefined)
    {
        return undefined;
    }

    const { openTab, boundsTab, closeTab, visibleTab, reloadTab, backTab, forwardTab } = bridge;

    if (openTab !== undefined && boundsTab !== undefined && closeTab !== undefined && visibleTab !== undefined && reloadTab !== undefined && backTab !== undefined && forwardTab !== undefined)
    {
        return {
            open: (url, visible, x, y, width, height) => { openTab(id, url, visible, x, y, width, height); },
            setBounds: (x, y, width, height) => { boundsTab(id, x, y, width, height); },
            close: () => { closeTab(id); },
            setVisible: (visible) => { visibleTab(id, visible); },
            reload: () => { reloadTab(id); },
            back: () => { backTab(id); },
            forward: () => { forwardTab(id); },
            hides: true
        };
    }

    const { setVisible } = bridge;

    // Without tab support only the frontmost tab is ever given a view, so it is always the visible one
    // and the flag has nothing to say here.
    return {
        open: (url, visible, x, y, width, height) => { bridge.open(url, x, y, width, height); },
        setBounds: (x, y, width, height) => { bridge.setBounds(x, y, width, height); },
        close: () => { bridge.close(); },
        setVisible: (visible) => { setVisible?.(visible); },
        reload: () => { bridge.reload(); },
        back: () => { bridge.back(); },
        forward: () => { bridge.forward(); },
        hides: setVisible !== undefined
    };
};

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
