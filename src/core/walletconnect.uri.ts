/**
 * A WalletConnect pairing arrives as a `wc:` URI, and it reaches a wallet by every route a URI
 * can travel: a link the page opens, a scheme the webview refuses to load, a deep link from
 * another app, or a QR the person read somewhere else and pasted. They all end up here, because
 * the only part that matters is the URI hiding inside whatever wrapper carried it.
 */

export interface WalletConnectLink {
    uri: string;
    topic: string;
    version: number;
}

// wc:<topic>@<version>?relay-protocol=irn&symKey=<hex>
const shape = /^wc:(?<topic>[\w.~-]+)@(?<version>\d+)\?(?<query>.+)$/u;

// The same URI as it appears inside prose — a clipboard entry, a page's copy button, an error
// message someone pasted whole. Anything that would end a URL in running text ends the match.
const loose = /wc:[\w.~-]+@\d+\?[^\s"'<>]+/iu;

const clean = (value: string) => {
    const trimmed = value.trim();

    if (/^wc%3a/iu.test(trimmed)) {
        try {
            return decodeURIComponent(trimmed);
        } catch {
            return trimmed;
        }
    }

    return trimmed;
};

const fromScheme = (value: string): WalletConnectLink | undefined => {
    // `wc://topic@2?…` is the same pairing as `wc:topic@2?…`; the authority form turns up in
    // links written by hand and in a few connect modals.
    const text = clean(value).replace(/^wc:\/\//iu, 'wc:');

    const found = shape.exec(text);

    if (found?.groups === undefined) {
        return undefined;
    }

    const { topic, version, query } = found.groups;

    const parsed = Number(version);

    // Version 2 is the only live protocol: the v1 bridge servers were switched off, so a v1 URI
    // is reported rather than paired, and the caller can say why instead of hanging on a relay
    // that will never answer.
    if (parsed === 2) {
        const search = new URLSearchParams(query);

        if (search.get('relay-protocol') === null || (search.get('symKey') ?? '').length === 0) {
            return undefined;
        }
    }

    return { uri: text, topic, version: parsed };
};

const fromWrapper = (value: string): WalletConnectLink | undefined => {
    let url: URL;

    try {
        url = new URL(value);
    } catch {
        return undefined;
    }

    // A wallet is normally reached as `https://wallet.example/wc?uri=…` or `nurawallet://wc?uri=…`.
    // The parameter is the pairing; the rest is only the envelope that carried it here. A site that
    // routes on the fragment — `#/wc?uri=…` — keeps its query there, after the first question mark.
    const hash = url.hash.includes('?') ? url.hash.slice(url.hash.indexOf('?') + 1) : '';

    const carried = url.searchParams.get('uri') ?? new URLSearchParams(hash).get('uri');

    if (carried === null || carried.length === 0) {
        return undefined;
    }

    return fromScheme(carried);
};

export const readWalletConnectUri = (raw: string): WalletConnectLink | undefined => {
    if (typeof raw !== 'string' || raw.length === 0) {
        return undefined;
    }

    const text = raw.trim();

    const direct = fromScheme(text);

    if (direct !== undefined) {
        return direct;
    }

    const wrapped = fromWrapper(text);

    if (wrapped !== undefined) {
        return wrapped;
    }

    const loosened = loose.exec(text);

    return loosened === null ? undefined : fromScheme(loosened[0]);
};

export const isWalletConnectLink = (raw: string) => readWalletConnectUri(raw) !== undefined;

/**
 * Anything the browser cannot load itself is offered to the wallet before it is dropped. Only a
 * pairing is interesting, but the test has to run on the raw scheme, because at that point the
 * URI is still wrapped in whatever the page or the system handed over.
 */
export const carriesWalletConnect = (raw: string) => {
    const text = raw.trim().toLowerCase();

    return text.startsWith('wc:') || text.includes('uri=wc%3a') || text.includes('uri=wc:');
};
