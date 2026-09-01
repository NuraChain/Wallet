import { getCurrent, isRegistered, onOpenUrl, register } from '@tauri-apps/plugin-deep-link';
import { openUrl } from '@tauri-apps/plugin-opener';

import { getVault } from './session';
import { answerDapp } from './dapp.rpc';
import { pairWalletConnect } from './walletconnect';
import { carriesWalletConnect } from './walletconnect.uri';

/**
 * nurawallet://wc?uri=<wc URI>  — and a bare `wc:` link the system hands over
 *
 * A WalletConnect pairing offered by another app, by a QR reader, or by a dApp that lists this
 * wallet. It goes straight to the WalletConnect client, which shows the session proposal for
 * approval; the link on its own grants nothing.
 *
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

const scheme = 'nurawallet';

const pending: ParsedLink[] = [];

const pendingPairings: string[] = [];

// Windows and Linux hand the launch URL over as a command line argument, so the same request
// arrives once from getCurrent() and again through onOpenUrl(). Answering it twice would raise
// two prompts for one signature.
const seen = new Set<string>();

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

const pair = (raw: string) => {
    // A pairing is only worth anything to an unlocked wallet: the proposal names the account it
    // would connect. A locked one keeps the link until the dashboard is up, exactly as a signing
    // request waits.
    if (getVault() === undefined) {
        pendingPairings.push(raw);

        return;
    }

    void pairWalletConnect(raw).catch(() => undefined);
};

const handle = (raw: string) => {
    if (carriesWalletConnect(raw)) {
        pair(raw);

        return;
    }

    const link = parse(raw);

    if (link === undefined) {
        return;
    }

    if (seen.has(link.id)) {
        return;
    }

    seen.add(link.id);

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

    while (pendingPairings.length > 0) {
        const uri = pendingPairings.shift();

        if (uri !== undefined && getVault() !== undefined) {
            void pairWalletConnect(uri).catch(() => undefined);
        }
    }
};

/**
 * The installer claims the scheme — the NSIS and MSI bundles on Windows, the .desktop file on
 * deb and rpm. A dev run and an AppImage have no installer, so the app claims it itself. The
 * call is unsupported on Android, where the manifest declares the intent filter instead.
 */
const claimScheme = async () => {
    try {
        if (!(await isRegistered(scheme))) {
            await register(scheme);
        }
    } catch {
        // Either the platform has no registry to write to, or the scheme is already someone's.
    }
};

export const startDeepLinks = () => {
    const run = async () => {
        await claimScheme();

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
