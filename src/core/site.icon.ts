import { imageCache } from './image';
import { httpRequest } from './request';
import { clearUnder, prune, readRaw, writeRaw } from './cache.store';

const prefix = 'site-icon/v1/';

const day = 24 * 60 * 60 * 1000;

const lifetime = 7 * day;

/** A host that offered nothing usable is asked again tomorrow, not on the next render. */
const emptyLifetime = day;

const maxHosts = 200;

const maxHtmlBytes = 512 * 1024;

/**
 * Below this an icon is a 16px relic that looks soft in a 32px slot, so a site that declares both is
 * read at the smallest size that still holds up, and only falls back to whatever else it offers.
 */
const usableSize = 32;

interface Found {
    icon: string;
    at: number;
}

const pending = new Map<string, Promise<string>>();

const originOf = (url: string) => {
    try {
        return new URL(url).origin;
    } catch {
        return '';
    }
};

const absolute = (href: string, base: string) => {
    try {
        return new URL(href, base).href;
    } catch {
        return '';
    }
};

const parse = (raw: string): Found | undefined => {
    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(raw) as Found;

        if (typeof parsed?.icon !== 'string' || typeof parsed.at !== 'number') {
            return undefined;
        }

        return parsed;
    } catch {
        return undefined;
    }
};

const read = (origin: string) => {
    const raw = readRaw('local', `${prefix}${origin}`);

    return raw === undefined ? undefined : parse(raw);
};

const write = (origin: string, icon: string) => {
    writeRaw('local', `${prefix}${origin}`, JSON.stringify({ icon, at: Date.now() }));

    prune('local', prefix, maxHosts, (raw) => parse(raw)?.at ?? 0);
};

const fresh = (held: Found) => Date.now() - held.at < (held.icon.length > 0 ? lifetime : emptyLifetime);

const sizeOf = (sizes: string) => Math.max(0, ...[...sizes.matchAll(/(?<edge>\d+)x\d+/giu)].map((match) => Number(match.groups?.edge ?? 0)));

/** Smallest size that still reads well first, then anything larger, then the sizes nobody declared. */
const preference = (size: number) => (size >= usableSize ? size : usableSize * 1000 - size);

const declared = async (origin: string) => {
    try {
        const response = await httpRequest(origin, { redirect: 'follow' });

        if (!response.ok || !(response.headers.get('content-type') ?? '').toLowerCase().includes('html')) {
            return [];
        }

        const html = (await response.text()).slice(0, maxHtmlBytes);

        // The markup is parsed, never run: DOMParser builds an inert document, so a hostile page has
        // nothing to execute here. A regex over the same markup would miss half the ways a link tag
        // is written and trip over the other half.
        const parsed = new DOMParser().parseFromString(html, 'text/html');

        const base = response.url.length > 0 ? response.url : origin;

        const links = [...parsed.querySelectorAll('link[rel][href]')]
            .filter((link) => /(?:^|\s)(?:shortcut\s+)?(?:icon|apple-touch-icon)(?:\s|$)/iu.test(link.getAttribute('rel') ?? ''))
            .map((link) => ({
                href: absolute(link.getAttribute('href') ?? '', base),
                rank: preference(sizeOf(link.getAttribute('sizes') ?? ''))
            }))
            .filter((item) => item.href.length > 0)
            .sort((left, right) => left.rank - right.rank);

        return [...new Set(links.map((item) => item.href))];
    } catch {
        return [];
    }
};

const firstUsable = async (candidates: string[]) => {
    for (const candidate of candidates) {
        // oxlint-disable-next-line no-await-in-loop
        const object = await imageCache.get(candidate, 'unknown');

        if (object.length > 0) {
            return candidate;
        }
    }

    return '';
};

const discover = async (origin: string) => {
    // /favicon.ico is still what most hosts answer, and asking for it costs one small request. Only
    // when it is missing — a 404, or the HTML a redirect hands back instead — is the page itself read
    // for the icon it declares, which is the only way to find one that is neither at the root nor
    // named favicon.
    const direct = await firstUsable([`${origin}/favicon.ico`]);

    if (direct.length > 0) {
        return direct;
    }

    return firstUsable(await declared(origin));
};

/**
 * The icon a site actually serves, as a URL for the image cache to hold. Resolved once per origin
 * and remembered, because the lookup can cost a page fetch and every favourite, tab and history row
 * on the browser's home screen asks for one.
 */
export const resolveSiteIcon = async (url: string): Promise<string> => {
    const origin = originOf(url);

    if (origin.length === 0) {
        return '';
    }

    const held = read(origin);

    if (held !== undefined && fresh(held)) {
        return held.icon;
    }

    const running = pending.get(origin);

    if (running !== undefined) {
        return running;
    }

    const task = discover(origin)
        .catch(() => '')
        .then((icon) => {
            write(origin, icon);

            return icon;
        })
        .finally(() => {
            pending.delete(origin);
        });

    pending.set(origin, task);

    return task;
};

export const clearSiteIcons = () => {
    pending.clear();

    clearUnder('local', prefix);
};
