import config from '../config';
import { getPlatform } from '../utility/platform';

import type { DashboardModal, PresenceScreen } from '../type/app';

/* The only lines Discord is ever shown besides the host name of a built-in dApp. They are fixed English, as Discord shows the rest of the activity,
   and none carries an address, a balance, an amount or a URL. There is no NFT screen to describe. */
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

/** The site is named only while the browser is what the activity describes, not under a dialog that says otherwise. */
export const presenceDetails = (state: string | undefined, site: string | undefined) => (state === browsing ? site : undefined);

let supported: boolean | undefined;

// Discord's IPC is the desktop app's; there is none to reach from a phone or an extension. Whether the activity is shared is the
// user's choice in Discord itself.
const presenceSupported = () => {
    if (supported === undefined) {
        const host = getPlatform();

        supported = config.discord.appId.length > 0 && (host === 'windows' || host === 'macos' || host === 'linux');
    }

    return supported;
};

let path = '/';
let screen: PresenceScreen | undefined;
let site: string | undefined;

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

    const { appId, largeImage, largeText, buttons } = config.discord;

    const state = presenceState(path, screen);

    const activity = { appId, state: state ?? null, details: presenceDetails(state, site) ?? null, largeImage, largeText, buttons };

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
    site = presenceSite(url);

    void publish();
};
