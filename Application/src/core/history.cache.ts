import { cacheLog, clearUnder, prune, readRaw, writeRaw } from './cache.store';

/**
 * A single account transaction as shown in the activity list.
 *
 * Defined here rather than beside the hook that fetches it: the cache stores these, so owning the shape
 * keeps `core` from importing a type back out of the layer that consumes it. `hook/history` re-exports
 * it, so every existing import site is unchanged.
 */
export interface Transaction
{
    id: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    symbol: string;
    timestamp: number;
    incoming: boolean;
}

/**
 * Every tunable this cache has, in one place.
 *
 * `history` is the only TTL the app can currently use: one fetch feeds both the activity glance and
 * the searchable overview, so there is one dataset and one lifetime for it. The other surfaces a
 * transaction cache usually carries — a details pane, a pending pool, a status poll — are not fetched
 * anywhere in this app, and a TTL declared for them would be a number nothing reads.
 *
 * `stale` is how long a cached list may still be *shown* after it stops being fresh. Between `history`
 * and `stale` the list renders immediately and is revalidated behind the render; past `stale` it is
 * still rendered rather than blanked, because a stale list beats an empty screen — the network result
 * replaces it when it lands.
 */
const cacheConfig =
{
    /** How long a fetched list is served without revalidating. */
    history: 2 * 60 * 1000,

    /** How long a list keeps rendering while a refresh runs behind it. */
    stale: 24 * 60 * 60 * 1000,

    /** Entries kept before the least recently used are dropped. */
    entries: 24
};

/**
 * Namespace for this cache's keys.
 *
 * **Local** storage, deliberately: a transaction that happened stays happened, so a list restored on
 * the next launch is as true as it was when written — the opposite of a balance, which is why the token
 * cache sits in session storage instead.
 */
const prefix = 'tx-cache/v1/';

/**
 * What is held for one account on one chain.
 *
 * `notice` is stored beside the rows because it is the other half of the same answer: an explorer that
 * refuses the request produces no rows *and* a reason, and restoring the rows without the reason would
 * turn "unreadable" back into "no transactions" on the next launch.
 */
interface HistoryEntry
{
    items: Transaction[];
    notice: string;
    written: number;
    used: number;
}

/** What a read found, and whether the caller still needs to go to the network. */
interface HistoryHit
{
    entry: HistoryEntry;
    fresh: boolean;
}

/**
 * historyKey - The deterministic name one account's history is filed under.
 *
 * Every input that changes the answer is in the key and nothing else is: the chain (a list is only true
 * of the chain it came from), the account, the explorer actually being asked (a custom network's API
 * can be edited, and the old answer is not the new endpoint's answer), and the tracked token list,
 * because the token pass only reports contracts it was given. The address is lowercased and the token
 * list sorted so that the same set in a different order is the same key rather than a second copy.
 * @param {string} address The account address.
 * @param {number} chainId The chain the account is being read on.
 * @param {string} api The explorer API base the request goes to.
 * @param {string[]} tokens The tracked token contract addresses.
 * @returns {string} A stable key.
 */
export const historyKey = (address: string, chainId: number, api: string, tokens: string[]) => `${ chainId }|${ address.toLowerCase() }|${ api }|${ [ ...tokens ].map((item) => item.toLowerCase()).sort().join(',') }`;

/**
 * identity - The stable identity of one transaction row, for deduplication.
 *
 * Not the row's `id`, which carries its position in the response and therefore changes between two
 * fetches of the same transaction. A hash alone is not enough either: one transaction hash produces a
 * native row and a token row whenever a transfer was paid for in the chain's own coin, and keying on
 * the hash would drop one of the two. Hash plus the parties, the symbol and the amount is what makes
 * "the same movement" — the same thing a hash and a log index identify, reached from the fields this
 * app actually has.
 * @param {Transaction} item The row.
 * @returns {string} Its identity.
 */
const identity = (item: Transaction) => `${ item.hash }|${ item.symbol }|${ item.from.toLowerCase() }|${ item.to.toLowerCase() }|${ item.value }`;

/**
 * mergeTransactions - Folds a newer read into what was already held.
 *
 * The newer rows win on collision, so a row that changed between reads takes its new form rather than
 * being kept at the old one. Order is newest first and the sort is stable, so rows sharing a timestamp
 * — everything mined in one block — keep the order the explorer returned them in rather than shuffling
 * between renders.
 * @param {Transaction[]} held What is already cached.
 * @param {Transaction[]} found What the network just returned.
 * @returns {Transaction[]} One ordered, deduplicated list.
 */
const mergeTransactions = (held: Transaction[], found: Transaction[]) =>
{
    const byIdentity = new Map<string, Transaction>();

    for (const item of held)
    {
        byIdentity.set(identity(item), item);
    }

    for (const item of found)
    {
        byIdentity.set(identity(item), item);
    }

    return [ ...byIdentity.values() ].sort((left, right) => right.timestamp - left.timestamp);
};

/**
 * parse - Reads one stored entry back, or `undefined` when it is not what was written.
 * @param {string | undefined} raw The serialized entry.
 * @returns {HistoryEntry | undefined} The entry, or `undefined`.
 */
const parse = (raw: string | undefined) =>
{
    if (raw === undefined)
    {
        return undefined;
    }

    try
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const entry = JSON.parse(raw) as HistoryEntry;

        if (!Array.isArray(entry.items) || typeof entry.written !== 'number')
        {
            return undefined;
        }

        return entry;
    }
    catch
    {
        return undefined;
    }
};

/**
 * readHistory - The held answer for a key, and whether it is still fresh.
 *
 * Anything that does not parse as what was written is treated as absent rather than thrown — a cache
 * is never worth failing a render over.
 * @param {string} key The key from `historyKey`.
 * @returns {HistoryHit | undefined} What is held and whether it is fresh, or `undefined`.
 */
export const readHistory = (key: string): HistoryHit | undefined =>
{
    const entry = parse(readRaw('local', prefix + key));

    if (entry === undefined)
    {
        cacheLog('miss', key);

        return undefined;
    }

    const age = Date.now() - entry.written;

    cacheLog(age > cacheConfig.stale ? 'expired' : 'hit', key, `${ entry.items.length } rows`);

    return { entry, fresh: age <= cacheConfig.history };
};

/**
 * writeHistory - Stores an answer, merged with whatever that key already held.
 *
 * Merging rather than replacing is what makes a short read non-destructive: the explorer returns a
 * fixed page, so a later read that comes back thinner than an earlier one would otherwise throw away
 * rows the account still has.
 * @param {string} key The key from `historyKey`.
 * @param {Transaction[]} items The rows just read.
 * @param {string} notice Why there were none, when the explorer said so.
 * @returns {Transaction[]} The merged list now held, which is what the caller should render.
 */
export const writeHistory = (key: string, items: Transaction[], notice: string) =>
{
    const held = parse(readRaw('local', prefix + key));

    const merged = held === undefined ? [ ...items ].sort((left, right) => right.timestamp - left.timestamp) : mergeTransactions(held.items, items);

    const entry: HistoryEntry = { items: merged, notice, written: Date.now(), used: Date.now() };

    writeRaw('local', prefix + key, JSON.stringify(entry));

    prune('local', prefix, cacheConfig.entries, (raw) => parse(raw)?.used ?? 0);

    cacheLog('write', key, `${ merged.length } rows`);

    return merged;
};

/**
 * touchHistory - Records that a key was read, without changing what it holds.
 *
 * Separate from `writeHistory` because eviction sorts on last use and a cache hit is a use; folding it
 * into the write would make an entry that is only ever read look like the coldest thing there.
 * @param {string} key The key from `historyKey`.
 */
export const touchHistory = (key: string) =>
{
    const entry = parse(readRaw('local', prefix + key));

    if (entry !== undefined)
    {
        writeRaw('local', prefix + key, JSON.stringify({ ...entry, used: Date.now() }));
    }
};

/**
 * invalidateHistory - Drops the entries a change actually affects.
 *
 * Scoped rather than wholesale: switching account or chain does not make the other account's history
 * wrong, and clearing it would cost a re-download for a change that did not touch it. Called with no
 * argument — which only logging out and importing a wallet do — it drops everything, because at that
 * point none of it belongs to the wallet that is now open.
 * @param {(key: string) => boolean} [match] Which keys to drop; omit to drop all of them.
 */
export const invalidateHistory = (match?: (key: string) => boolean) =>
{
    clearUnder('local', prefix, match);
};
