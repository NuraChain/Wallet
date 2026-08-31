import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { openUrl } from '@tauri-apps/plugin-opener';

import { getVault } from './session';
import { answerDapp } from './dapp.rpc';

/**
 * nurawallet://dapp?request=<base64url(JSON)>
 *
 * JSON: { id: string, method: string, params?: unknown[], callback: 'https://…' }
 *
 * The request runs through the same provider pipeline as a page in the in-app browser —
 * same prompts, same per-origin connection grants — with the callback URL's origin standing
 * in as the requesting site. The reply is delivered by opening the callback in the system
 * browser with '#nura=<base64url({ id, result?, error? })>' appended; the fragment keeps the
 * payload out of server logs.
 */

interface ParsedLink {
    id: string;
    method: string;
    params: unknown[];
    callback: URL;
}

const pending: ParsedLink[] = [];

const fromBase64Url = (value: string) => {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/');

    return new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.codePointAt(0) ?? 0));
};

const toBase64Url = (value: string) => {
    const bytes = new TextEncoder().encode(value);

    let raw = '';

    for (const byte of bytes) {
        raw += String.fromCodePoint(byte);
    }

    return btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
};

const parse = (raw: string): ParsedLink | undefined => {
    let url: URL;

    try {
        url = new URL(raw);
    } catch {
        return undefined;
    }

    if (url.protocol !== 'nurawallet:' || (url.hostname !== 'dapp' && !url.pathname.startsWith('//dapp'))) {
        return undefined;
    }

    const packed = url.searchParams.get('request');

    if (packed === null || packed.length === 0) {
        return undefined;
    }

    let body: unknown;

    try {
        body = JSON.parse(fromBase64Url(packed));
    } catch {
        return undefined;
    }

    if (typeof body !== 'object' || body === null || !('id' in body) || !('method' in body) || !('callback' in body)) {
        return undefined;
    }

    const { id, method, callback } = body;

    if (typeof id !== 'string' || id.length === 0 || typeof method !== 'string' || typeof callback !== 'string') {
        return undefined;
    }

    let target: URL;

    try {
        target = new URL(callback);
    } catch {
        return undefined;
    }

    if (target.protocol !== 'https:') {
        return undefined;
    }

    const params = 'params' in body && Array.isArray(body.params) ? body.params : [];

    return { id, method, params, callback: target };
};

const respond = async (link: ParsedLink) => {
    const reply = await answerDapp({ id: link.id, label: 'deeplink', origin: link.callback.origin, method: link.method, params: link.params });

    const target = new URL(link.callback.href);

    target.hash = `nura=${toBase64Url(JSON.stringify(reply))}`;

    try {
        await openUrl(target.href);
    } catch {
        // The redirect is best-effort: the request itself already ran.
    }
};

const handle = (raw: string) => {
    const link = parse(raw);

    if (link === undefined) {
        return;
    }

    // A locked wallet cannot sign, so the request waits for the dashboard rather than failing.
    if (getVault() === undefined) {
        pending.push(link);

        return;
    }

    void respond(link);
};

export const flushDeepLinks = () => {
    while (pending.length > 0) {
        const link = pending.shift();

        if (link !== undefined && getVault() !== undefined) {
            void respond(link);
        }
    }
};

export const startDeepLinks = () => {
    const run = async () => {
        await onOpenUrl((urls) => {
            for (const url of urls) {
                handle(url);
            }
        });

        const initial = await getCurrent();

        for (const url of initial ?? []) {
            handle(url);
        }
    };

    run().catch(() => {
        // Outside a Tauri window the plugin throws; the browser preview has no deep links.
    });
};
