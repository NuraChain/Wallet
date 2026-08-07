import { cacheLog, clearUnder, prune, readRaw, writeRaw } from './cache.store';

import type { Token, TokenBalance } from './token';

/**
 * Every tunable this cache has, in one place.
 *
 * `balances` is deliberately short. A balance is money on screen, and the value of caching it is
 * covering the gap between switching to an account and its `balanceOf` calls returning — not saving a
 * read minutes later. `discovery` is long because the *set* of contracts an account holds changes far
 * more slowly than the amounts in them.
 */
const tokenCacheConfig =
{
    /** How long held balances answer a read without going back to the chain. */
    balances: 30 * 1000,

    /** How long a completed discovery sweep suppresses the next one for the same account and chain. */
    discovery: 10 * 60 * 1000,

    /** Accounts kept per namespace before the least recently written are dropped. */
    entries: 32
};

/**
 * Where each kind lives, and why.
 *
 * Balances sit in **session** storage: they persist across reloads, navigation and account switching
 * inside one run of the app, and are gone on the next launch. That is the distinction that matters for
 * money — a balance read minutes ago is worth rendering while a fresh read runs behind it, but the same
 * number restored after a restart is of unknown age and looks exactly like a current one.
 *
 * The discovery stamp sits in **local** storage, because it carries no value at all — only the time a
 * sweep last ran. Surviving a restart is precisely what makes it useful.
 */
const balancePrefix = 'token-cache/v1/balances/';
const nativePrefix = 'token-cache/v1/native/';
const sweepPrefix = 'token-cache/v1/sweep/';

/**
 * A balance as it is stored.
 *
 * `value` is a decimal string rather than the `bigint` it is in memory: `JSON.stringify` throws on a
 * `bigint` outright, so the conversion is not an optimisation but the only way this serializes at all.
 * `formatted` is kept beside it rather than recomputed, since it is what the row renders and deriving
 * it again would need the token's decimals at read time.
 */
interface StoredBalance { address: string; value: string; formatted: string }

/** What one account's token balances look like in storage. */
interface StoredBalances { tokens: StoredBalance[]; written: number }

/** What one account's coin balance looks like in storage. */
interface StoredNative { value: string; written: number }

/**
 * stamp - Reads the write time out of a stored payload, for eviction ordering.
 * @param {string} raw The serialized entry.
 * @returns {number} Its write time, or 0 when it cannot be read.
 */
const stamp = (raw: string) =>
{
    try
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(raw) as { written?: unknown };

        return typeof parsed.written === 'number' ? parsed.written : 0;
    }
    catch
    {
        return 0;
    }
};

/**
 * balanceKey - The deterministic name one account's token balances are filed under.
 *
 * The tracked contracts are part of the key because they are part of the answer: this reads the tokens
 * it was handed, so a different list is a different result rather than a stale version of the same one.
 * Lowercased and sorted, so the same set in another order is the same key.
 * @param {string} address The account address.
 * @param {string} networkId The active network's id.
 * @param {Token[]} tokens The tracked tokens being read.
 * @returns {string} A stable key.
 */
export const balanceKey = (address: string, networkId: string, tokens: Token[]) => `${ networkId }|${ address.toLowerCase() }|${ tokens.map((item) => item.address.toLowerCase()).sort().join(',') }`;

/**
 * readBalances - The held balances for a key, and whether they are still fresh.
 *
 * A stale hit is still returned rather than withheld: the caller renders it immediately and refreshes
 * behind it, which is the difference between switching accounts and seeing last-known numbers versus
 * seeing an empty list until the chain answers.
 *
 * Stored rows are matched back onto the live token objects rather than rebuilt from what was written,
 * so a row always carries the same `Token` the rest of the screen is using and nothing downstream can
 * tell a restored row from a freshly read one. A contract no longer tracked is dropped on the way out.
 * @param {string} key The key from `balanceKey`.
 * @param {Token[]} tokens The tokens currently tracked, which stored rows are matched against.
 * @returns {{ tokens: TokenBalance[]; fresh: boolean } | undefined} What is held, or `undefined`.
 */
export const readBalances = (key: string, tokens: Token[]) =>
{
    const raw = readRaw('session', balancePrefix + key);

    if (raw === undefined)
    {
        cacheLog('miss', key);

        return undefined;
    }

    try
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(raw) as StoredBalances;

        if (!Array.isArray(parsed.tokens) || typeof parsed.written !== 'number')
        {
            return undefined;
        }

        const byAddress = new Map(tokens.map((item) => [ item.address.toLowerCase(), item ]));

        const restored = parsed.tokens.flatMap((item): TokenBalance[] =>
        {
            const token = typeof item.address === 'string' ? byAddress.get(item.address.toLowerCase()) : undefined;

            if (token === undefined || typeof item.value !== 'string' || !(/^\d+$/u).test(item.value))
            {
                return [];
            }

            return [ { token, value: BigInt(item.value), formatted: typeof item.formatted === 'string' ? item.formatted : '0' } ];
        });

        const fresh = Date.now() - parsed.written <= tokenCacheConfig.balances;

        cacheLog(fresh ? 'hit' : 'stale', key, `${ restored.length } tokens`);

        return { tokens: restored, fresh };
    }
    catch
    {
        return undefined;
    }
};

/**
 * writeBalances - Stores the balances just read.
 *
 * Replaces rather than merges, unlike the transaction cache: a balance is a current value and an older
 * reading of it is simply wrong, so there is nothing in the previous entry worth keeping.
 * @param {string} key The key from `balanceKey`.
 * @param {TokenBalance[]} tokens The balances just read.
 */
export const writeBalances = (key: string, tokens: TokenBalance[]) =>
{
    const payload: StoredBalances =
    {
        tokens: tokens.map((item) => ({ address: item.token.address, value: item.value.toString(), formatted: item.formatted })),
        written: Date.now()
    };

    writeRaw('session', balancePrefix + key, JSON.stringify(payload));

    prune('session', balancePrefix, tokenCacheConfig.entries, stamp);

    cacheLog('write', key, `${ tokens.length } tokens`);
};

/**
 * readNative - The held coin balance for a key, and whether it is still fresh.
 * @param {string} key The account and network the balance belongs to.
 * @returns {{ value: bigint; fresh: boolean } | undefined} What is held, or `undefined`.
 */
export const readNative = (key: string) =>
{
    const raw = readRaw('session', nativePrefix + key);

    if (raw === undefined)
    {
        return undefined;
    }

    try
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(raw) as StoredNative;

        if (typeof parsed.value !== 'string' || !(/^\d+$/u).test(parsed.value) || typeof parsed.written !== 'number')
        {
            return undefined;
        }

        const fresh = Date.now() - parsed.written <= tokenCacheConfig.balances;

        cacheLog(fresh ? 'hit native' : 'stale native', key);

        return { value: BigInt(parsed.value), fresh };
    }
    catch
    {
        return undefined;
    }
};

/**
 * writeNative - Stores the coin balance just read.
 * @param {string} key The account and network the balance belongs to.
 * @param {bigint} value The balance in wei.
 */
export const writeNative = (key: string, value: bigint) =>
{
    const payload: StoredNative = { value: value.toString(), written: Date.now() };

    writeRaw('session', nativePrefix + key, JSON.stringify(payload));

    prune('session', nativePrefix, tokenCacheConfig.entries, stamp);
};

/**
 * discoveryKey - The deterministic name a discovery sweep is remembered under.
 * @param {string} address The account address.
 * @param {number} chainId The chain the sweep runs against.
 * @returns {string} A stable key.
 */
export const discoveryKey = (address: string, chainId: number) => `${ chainId }|${ address.toLowerCase() }`;

/**
 * discoveryDue - Whether the sweep is worth running again for this account and chain.
 *
 * The sweep is the most expensive thing the wallet tab does — an explorer call, then a `balanceOf`
 * against every contract it named — and it ran on every mount and every chain switch, including a
 * switch straight back to a chain swept seconds earlier. What it finds changes on the timescale of
 * receiving a new token, so asking again within the window buys nothing.
 * @param {string} key The key from `discoveryKey`.
 * @returns {boolean} True when the sweep should run.
 */
export const discoveryDue = (key: string) =>
{
    const raw = readRaw('local', sweepPrefix + key);

    const at = raw === undefined ? Number.NaN : Number(raw);

    const due = !Number.isFinite(at) || Date.now() - at > tokenCacheConfig.discovery;

    if (!due)
    {
        cacheLog('skip sweep', key);
    }

    return due;
};

/**
 * markDiscovered - Records that the sweep finished for this account and chain.
 * @param {string} key The key from `discoveryKey`.
 */
export const markDiscovered = (key: string) =>
{
    writeRaw('local', sweepPrefix + key, String(Date.now()));

    prune('local', sweepPrefix, tokenCacheConfig.entries, (raw) => Number(raw) || 0);

    cacheLog('sweep done', key);
};

/**
 * invalidateTokenCache - Drops what a change actually affects.
 *
 * Called with no argument by logout, where none of it belongs to the wallet that is now open. Manual
 * refresh does not come through here: it passes its own force flag, so the entry stays available to
 * render while the refreshed read runs behind it.
 * @param {(key: string) => boolean} [match] Which keys to drop; omit to drop all of them.
 */
export const invalidateTokenCache = (match?: (key: string) => boolean) =>
{
    clearUnder('session', balancePrefix, match);
    clearUnder('session', nativePrefix, match);
    clearUnder('local', sweepPrefix, match);
};
