import { getValue, setValue } from '../utility/storage';

/**
 * One dApp on the apps tab: what to call it and where it lives.
 *
 * The same three fields a browser favourite carries, and deliberately so — the two are edited by the
 * same dialog. They are separate lists rather than one because they answer different questions: a
 * favourite is a site someone kept while browsing, an app is something the wallet offers to connect
 * to, and a grid of the second is not improved by everything in the first appearing in it.
 *
 * The id is what edits, removals and reordering address, rather than the URL: the URL is the field
 * most likely to be the one being changed, and a list keyed on the thing being edited loses track of
 * the row halfway through the edit.
 */
export interface DappEntry {
    id: string;
    name: string;
    url: string;
}

/**
 * The apps a wallet starts with.
 *
 * Seeded rather than fixed, on the same terms as the browser's favourites: everything here can be
 * renamed, re-aimed, reordered or removed, and the stored list is what is shown from then on. The name
 * is written rather than translated, because it names a product rather than describing one.
 *
 * Nura Swap is the chain's own automated market maker, and it is also where the wallet reads Nura's
 * price from — see [price.ts](price.ts). A wallet that values a coin from a site it will not offer to
 * open is a wallet keeping a secret about where its numbers come from.
 */
const defaultApps: DappEntry[] = [{ id: 'swap', name: 'Swap', url: 'https://swap.nurachain.net' }];

/**
 * getApps - The kept dApps, in the order they are shown.
 *
 * A missing key means the wallet has never touched this list, so it gets the seed. A stored empty list
 * is a different thing and is honoured: someone who removed every app is not asking for them back on
 * the next launch.
 *
 * Anything that does not parse as the list it wrote is treated as no list at all, matching the
 * favourites reader — a grid of shortcuts is not worth failing the tab over.
 * @returns {Promise<DappEntry[]>} The stored apps, or the seeded ones.
 */
export const getApps = async (): Promise<DappEntry[]> => {
    const stored = await getValue('App.Apps');

    if (stored === undefined) {
        return defaultApps;
    }

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(stored) as DappEntry[];

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((item) => typeof item?.id === 'string' && typeof item.name === 'string' && typeof item.url === 'string' && item.url.length > 0);
    } catch {
        return [];
    }
};

/**
 * setApps - Writes the kept dApps.
 * @param {DappEntry[]} list The list to store, in display order.
 * @returns {Promise<void>} Resolves once written.
 */
export const setApps = async (list: DappEntry[]) => setValue('App.Apps', JSON.stringify(list));
