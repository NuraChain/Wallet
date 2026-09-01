/**
 * A trace of the provider lifecycle, off unless someone asks for it. It exists so a connection
 * that goes wrong can be followed end to end — page, bridge, wallet, answer — without a debugger
 * attached to a webview that has no devtools.
 *
 * What may be written here is deliberately narrow: the shape of a request, never its secrets. No
 * key, phrase, seed or signature ever reaches this file, and the redaction below is the second
 * line of defence rather than the first — call sites pass identifiers, not payloads.
 */

type DappScope = 'Provider' | 'Bridge' | 'Wallet';

const flag = 'nura.debug.dapp';

const forbidden = /(?<held>secret|private|mnemonic|phrase|seed|password|passphrase|signature|symkey|key)/iu;

const stored = () => {
    try {
        return globalThis.localStorage?.getItem(flag) === '1';
    } catch {
        // A webview with storage turned off simply has no stored preference.
        return false;
    }
};

let enabled = import.meta.env.DEV || stored();

export const setDappLogging = (on: boolean) => {
    enabled = on;

    try {
        if (on) {
            globalThis.localStorage?.setItem(flag, '1');
        } else {
            globalThis.localStorage?.removeItem(flag);
        }
    } catch {
        // The flag then lasts as long as this run, which is enough to read a trace.
    }
};

export const dappLogging = () => enabled;

const readable = (value: unknown): unknown => {
    if (typeof value === 'string') {
        return value.length > 200 ? `${value.slice(0, 200)}…` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
        return value;
    }

    return Array.isArray(value) ? `[${value.length} items]` : '[object]';
};

export const dappLog = (scope: DappScope, message: string, detail?: Record<string, unknown>) => {
    if (!enabled) {
        return;
    }

    const safe: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(detail ?? {})) {
        safe[key] = forbidden.test(key) ? '[redacted]' : readable(value);
    }

    // oxlint-disable-next-line no-console
    console.info(`[${scope}] ${message}`, safe);
};
