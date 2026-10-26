import { getSiteHost, getSiteNotices } from './browser';

import type { SiteNotices } from '../type/dapp';

const titleLimit = 80;
const bodyLimit = 240;

// A page that may notify still may not flood: one notification per site in this long.
const gap = 3000;

const shown = new Map<string, number>();

const cut = (text: string, limit: number) => {
    const flat = text.replaceAll(/\s+/gu, ' ').trim();

    return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
};

/** Asked when a site's switch is turned on, so a phone's own question comes up then and never over some page. */
export const askNoticePermission = async (): Promise<boolean> => {
    try {
        const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');

        return (await isPermissionGranted()) || (await requestPermission()) === 'granted';
    } catch {
        return false;
    }
};

const show = async (origin: string, title: string, body: string) => {
    if (!(await getSiteNotices(origin))) {
        return false;
    }

    const now = Date.now();

    if (now - (shown.get(origin) ?? 0) < gap) {
        return false;
    }

    shown.set(origin, now);

    try {
        const { isPermissionGranted, sendNotification } = await import('@tauri-apps/plugin-notification');

        if (!(await isPermissionGranted())) {
            return false;
        }

        // Named for its site, so a page cannot pass a notification off as the wallet's own. Its icon is never fetched.
        sendNotification({ title: `${getSiteHost(origin)}: ${cut(title, titleLimit)}`, body: cut(body, bodyLimit) });

        return true;
    } catch {
        return false;
    }
};

export const siteNotices: SiteNotices = { allowed: getSiteNotices, show };
