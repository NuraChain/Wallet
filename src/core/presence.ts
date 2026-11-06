import config from '../config';
import { getPlatform } from '../utility/platform';

import type { DashboardModal, PresencePlace, PresenceScreen } from '../type/app';

/* The only lines Discord is ever shown besides the host name of a built-in dApp and the games below. They are fixed English, as Discord shows
   the rest of the activity, and none carries an address, a balance, an amount or a URL. There is no NFT screen to describe. */
const dashboard = 'Viewing Dashboard';
const browsing = 'Browsing dApps';
const wallet = 'Viewing Wallet';
const settings = 'Configuring Wallet';

const tabStates = new Map<string, string>([
    ['Wallet', dashboard],
    ['Browser', browsing],
    ['Swap', 'Swapping Tokens'],
    ['Settings', settings]
]);

// A dialog left out here, the speed dial or a dApp's request, is described by the tab it opens over.
const modalStates = new Map<DashboardModal, string>([
    ['send', 'Sending NURA'],
    ['receive', 'Receiving Crypto'],
    ['accounts', wallet],
    ['tokens', wallet],
    ['history', wallet],
    ['network', wallet],
    ['redeem', wallet],
    ['language', settings],
    ['mouse', settings],
    ['biometric', settings],
    ['phrase', settings],
    ['delete', settings]
]);

/** Undefined outside the dashboard: before the wallet is open the activity names only the app. */
export const presenceState = (path: string, screen: PresenceScreen | undefined) => {
    if (path !== '/dashboard') {
        return undefined;
    }

    if (screen === undefined) {
        return dashboard;
    }

    return modalStates.get(screen.modal) ?? tabStates.get(screen.tab) ?? dashboard;
};

const hostOf = (url: string) => {
    let parsed: URL;

    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return undefined;
    }

    return parsed.hostname
        .toLowerCase()
        .replace(/\.$/u, '')
        .replace(/^www\./u, '');
};

// The wallet's own favourites, and only those: any other site the user opens stays theirs to know.
const knownSites = config.favorites.flatMap((item) => hostOf(item.url) ?? []);

/** The host of one of the built-in dApps, or one of their subdomains, with no path, query or port; undefined for any other page. */
export const presenceSite = (url: string) => {
    const host = hostOf(url);

    return host !== undefined && knownSites.some((site) => host === site || host.endsWith(`.${site}`)) ? host : undefined;
};

const gameSite = 'baziche.com';

// Keyed by the slug in Baziche's `/app/games/<slug>`; a slug missing here names no game.
const games = new Map([
    ['hokm', 'Hokm'],
    ['poker', 'Poker'],
    ['backgammon', 'Backgammon'],
    ['ludo', 'Ludo'],
    ['chess', 'Chess']
]);

/** Where a page is among the built-in dApps; undefined for any other page. A table's address carries no game, so it keeps the game of
    the page before it, as long as that was this game's page or another of its tables. */
export const presencePlace = (url: string, before?: PresencePlace): PresencePlace | undefined => {
    const site = presenceSite(url);

    if (site === undefined) {
        return undefined;
    }

    if (site !== gameSite && !site.endsWith(`.${gameSite}`)) {
        return { site, table: false };
    }

    const [root, area, slug, ...rest] = new URL(url).pathname
        .toLowerCase()
        .split('/')
        .filter((part) => part.length > 0);

    if (root !== 'app' || slug === undefined) {
        return { site, table: false };
    }

    if (area === 'games') {
        return { site, game: games.get(slug), table: false };
    }

    if (area === 'play' && rest.length === 0) {
        return { site, game: before?.site === site ? before.game : undefined, table: true };
    }

    return { site, table: false };
};

const placeLine = ({ site, game, table }: PresencePlace) => {
    if (table) {
        return game === undefined ? `In a game · ${site}` : `Playing ${game} · ${site}`;
    }

    return game === undefined ? site : `${game} · ${site}`;
};

/** The place is named only while the browser is what the activity describes, not under a dialog that says otherwise. */
export const presenceDetails = (state: string | undefined, place: PresencePlace | undefined) =>
    state === browsing && place !== undefined ? placeLine(place) : undefined;

let supported: boolean | undefined;

/* The desktop reaches the Discord app over its IPC pipe and Android through Discord's SDK, when the build carries it; iOS lets no app
   publish presence without the user signing in to Discord, and an extension has nothing to reach it with. Whether the activity is shared
   is the user's choice in Discord itself. */
const presenceSupported = () => {
    if (supported === undefined) {
        const host = getPlatform();

        supported = config.discord.appId.length > 0 && (host === 'windows' || host === 'macos' || host === 'linux' || host === 'android');
    }

    return supported;
};

let path = '/';
let screen: PresenceScreen | undefined;
let place: PresencePlace | undefined;

// What Rust was last handed, as JSON; undefined until one hand-off has gone through.
let sent: string | undefined;

// Read after the await, so calls made in one go all send the latest state and the ones after the first find it sent.
const publish = async () => {
    if (!presenceSupported()) {
        return;
    }

    const core = await import('@tauri-apps/api/core').catch(() => undefined);

    if (core === undefined) {
        return;
    }

    const { appId, largeImage, largeImageAddress, largeText, buttons } = config.discord;

    const state = presenceState(path, screen);

    // Discord on a phone draws no image for an uploaded asset's key, which leaves the activity bare there; Android is given its address instead.
    const image = getPlatform() === 'android' ? largeImageAddress : largeImage;

    const activity = { appId, state: state ?? null, details: presenceDetails(state, place) ?? null, largeImage: image, largeText, buttons };

    const next = JSON.stringify(activity);

    if (next === sent) {
        return;
    }

    sent = next;

    try {
        await core.invoke('presence_set', { activity });
    } catch {
        // Discord is optional; the wallet carries on without it.
        sent = undefined;
    }
};

export const setPresencePath = (next: string) => {
    path = next;

    void publish();
};

export const setPresenceScreen = (next: PresenceScreen | undefined) => {
    screen = next;

    void publish();
};

/** The page the browser shows, or an empty string at its start page or once it is out of sight. */
export const setPresenceSite = (url: string) => {
    place = presencePlace(url, place);

    void publish();
};

// Discord takes an update every four seconds at most, so a faster look would only be folded away.
const WATCH = 3000;

/** On the desktop a page moves on by itself, through its links and its own history, without the wallet hearing of it; while the
    activity can be shown, its address is read from the webview this often. */
export const watchPresencePage = (label: string) => {
    if (!presenceSupported()) {
        return () => {};
    }

    let stopped = false;

    const look = async () => {
        const core = await import('@tauri-apps/api/core').catch(() => undefined);

        const url = await core?.invoke<string>('browser_url', { label }).catch(() => undefined);

        if (!stopped && url !== undefined) {
            setPresenceSite(url);
        }
    };

    void look();

    const timer = window.setInterval(() => void look(), WATCH);

    return () => {
        stopped = true;

        window.clearInterval(timer);
    };
};
