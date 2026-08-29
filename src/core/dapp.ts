import { getValue, setValue } from '../utility/storage';

/**
 * One call a page has made, as it reaches the wallet.
 *
 * `origin` is the part a page cannot be trusted to state about itself, so it is never read out of the
 * payload: Kotlin takes it from the `WebView`'s own URL and Rust takes it from `Webview::url`, and both
 * write it here on the way past. Everything else in this object came from the page and is checked
 * before it is used.
 *
 * `label` names the view the call came from, which is what a reply and any later event have to be
 * addressed by — the browser holds a page per tab and they all speak at once.
 */
export interface DappEnvelope {
    id: string;
    label: string;
    origin: string;
    method: string;
    params: unknown[];
}

/**
 * What went wrong, in the shape EIP-1193 requires of a rejected request.
 *
 * `data` carries whatever the underlying RPC returned when a node is the thing that refused; a dApp
 * decoding a revert reason reads it out of there.
 */
export interface DappFailure {
    code: number;
    message: string;
    data?: unknown;
}

/**
 * The answer to one call.
 *
 * Exactly one of `result` and `error` is meaningful, and `error` is what decides which: a resolved
 * request can perfectly well answer `null`, so the presence of `result` cannot be the test.
 */
export interface DappReply {
    id: string;
    result?: unknown;
    error?: DappFailure;
}

/**
 * The error codes a provider is allowed to reject with.
 *
 * The 4xxx range is EIP-1193's own and is what dApps branch on — 4001 in particular, which every
 * library special-cases so that a user closing a dialog does not surface as a crash. 4902 comes from
 * EIP-3326 and is the answer that tells a dApp it may follow up with `wallet_addEthereumChain`.
 *
 * The negative codes are JSON-RPC 2.0's own, reused by EIP-1474 for the transport itself.
 */
export const dappError = {
    rejected: 4001,
    unauthorized: 4100,
    unsupported: 4200,
    disconnected: 4900,
    chainMissing: 4902,
    invalidInput: -32000,
    invalidRequest: -32600,
    methodMissing: -32601,
    invalidParams: -32602,
    internal: -32603
};

/**
 * A rejection carrying the code EIP-1193 requires, thrown wherever the router refuses.
 *
 * A real `Error` rather than the plain object this started as, for two reasons that turned out to be
 * the same one. It is what `throw` is for — a bare object loses the stack, so a refusal raised deep in
 * a parameter check arrives at the top with nothing to say about where it came from. And the wire
 * shape and the thrown shape are not the same thing: what a page receives is JSON, and an `Error`
 * serializes to `{}`, so the conversion has to be deliberate. `DappFailure` is the wire shape and
 * `describe` in [dapp.rpc.ts](dapp.rpc.ts) is the one place that crosses between them.
 */
export class DappError extends Error {
    public readonly code: number;
    public readonly data: unknown;

    /**
     * Constructor - Builds a rejection.
     * @param {number} code One of `dappError`.
     * @param {string} message Human-readable reason, which most dApp libraries surface verbatim.
     * @param {unknown} [data] Anything the caller should be able to decode, such as a revert payload.
     */
    public constructor(code: number, message: string, data?: unknown) {
        super(message);

        this.name = 'DappError';
        this.code = code;
        this.data = data;
    }
}

/**
 * failure - Builds the rejection to throw.
 *
 * A function rather than the constructor at every call site, because it reads as the thing it is at
 * the point of use: `throw failure(dappError.rejected, ...)` says what happened, where
 * `throw new DappError(...)` says how it is represented.
 * @param {number} code One of `dappError`.
 * @param {string} message Human-readable reason, which most dApp libraries surface verbatim.
 * @param {unknown} [data] Anything the caller should be able to decode, such as a revert payload.
 * @returns {DappError} The rejection to throw.
 */
export const failure = (code: number, message: string, data?: unknown) => new DappError(code, message, data);

/**
 * siteOrigin - Reduces a page address to the origin a permission is granted to.
 *
 * A grant is per origin and never per page: `https://app.example.com/swap` and
 * `https://app.example.com/pool` are the same site, and the site is what the user approved. Anything
 * that will not parse answers with an empty string, which no grant can ever match — an unparseable
 * address is not a site the wallet is willing to speak to.
 * @param {string} url The page address, as the native side reported it.
 * @returns {string} The origin, or an empty string when the address is unusable.
 */
export const siteOrigin = (url: string) => {
    try {
        const parsed = new URL(url);

        // Only the two web schemes. The browser refuses to load anything else (see
        // `shouldOverrideUrlLoading` in BrowserBridge.kt), but a provider that would answer a
        // `file://` or a custom scheme is a provider that answers whatever manages to get loaded, and
        // the origin of those is either opaque or chosen by whoever crafted the address.
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : '';
    } catch {
        return '';
    }
};

/**
 * The origins allowed to see an account, in the order they were granted.
 *
 * A grant records **that** a site may see the wallet, not **which** address it may see. Storing the
 * address looked like the more precise thing and is the wrong shape: the wallet has one active account
 * and the user switches it whenever they like, so a stored address is a second source of truth that
 * goes stale the moment they do. Every connected page would then be reading an account the wallet is
 * no longer on, and `eth_accounts` would answer with an address the user cannot sign with.
 *
 * So the grant is a boolean and the account is always the active one. Switching accounts re-answers
 * every connected page through `accountsChanged`, which is the event that exists for exactly this.
 */
let granted: string[] = [];

/**
 * loadConnections - Reads the granted origins back.
 *
 * Deliberately not on the startup path: this is only needed once the browser is open, and it is read
 * defensively for the same reason the browser's own lists are — a corrupt entry should cost the
 * grants, which the user can give again, rather than the app.
 * @returns {Promise<string[]>} The origins as they now stand.
 */
export const loadConnections = async (): Promise<string[]> => {
    const stored = await getValue('Browser.Connections').catch(() => undefined);

    if (stored === undefined) {
        return granted;
    }

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(stored) as string[];

        granted = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.length > 0) : [];
    } catch {
        granted = [];
    }

    return granted;
};

/**
 * getConnections - The origins currently allowed to see an account.
 * @returns {string[]} The granted origins.
 */
export const getConnections = () => granted;

/**
 * isConnected - Whether a site has already been approved.
 *
 * The question every account-bearing method asks before it answers, and the reason an unapproved site
 * reading `eth_accounts` gets an empty list rather than a rejection: EIP-1193 has an unconnected page
 * told nothing, not told off.
 * @param {string} origin The origin the call arrived from.
 * @returns {boolean} True when the site holds a grant.
 */
export const isConnected = (origin: string) => origin.length > 0 && granted.includes(origin);

/**
 * grantConnection - Records that the user approved a site.
 * @param {string} origin The origin to approve.
 * @returns {Promise<void>} Resolves once written.
 */
export const grantConnection = async (origin: string) => {
    if (origin.length === 0 || granted.includes(origin)) {
        return;
    }

    granted = [...granted, origin];

    await setValue('Browser.Connections', JSON.stringify(granted));
};

/**
 * revokeConnection - Withdraws a site's grant.
 *
 * The page is not reloaded on the way out. EIP-1193 covers this case exactly: a provider that loses
 * its accounts emits `accountsChanged` with an empty list, and a dApp that handles the event returns
 * itself to its disconnected state without losing whatever the user had typed into it.
 * @param {string} origin The origin to forget.
 * @returns {Promise<void>} Resolves once written.
 */
export const revokeConnection = async (origin: string) => {
    if (!granted.includes(origin)) {
        return;
    }

    granted = granted.filter((item) => item !== origin);

    await setValue('Browser.Connections', JSON.stringify(granted));
};

/**
 * clearConnections - Forgets every grant.
 *
 * Offered beside the browser's history and icon clearing, because it is the same kind of record: the
 * list of sites a wallet has been connected to says where its owner has been just as plainly as the
 * list of sites it has visited.
 * @returns {Promise<void>} Resolves once written.
 */
export const clearConnections = async () => {
    granted = [];

    await setValue('Browser.Connections', JSON.stringify(granted));
};
