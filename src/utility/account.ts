import { T } from './language';
import { getValue, setValue } from './storage';

/**
 * A single derivable account.
 *
 * `index` is the BIP44 address index used by `WalletManager` (`m/44'/60'/0'/0/{index}`), so the whole account list is reproducible from the one mnemonic — nothing extra is persisted beyond the label and the chosen badge.
 *
 * `emoji` is absent until the user picks one, and the account falls back to showing its index. It is never empty: clearing the badge removes the field rather than storing a blank.
 */
export interface Account {
    index: number;
    name: string;
    emoji?: string;
}

/**
 * Longest badge accepted from storage.
 *
 * An emoji is rarely one code unit — a flag is two, and anything with a skin tone or a variation
 * selector is more — so the cap is generous, but it still stops a hand-edited store from putting a
 * paragraph on the account disc.
 */
const emojiLimit = 16;

/**
 * Highest derivation index the wallet will accept, exclusive.
 *
 * Accounts are not slots to be filled any more — index 0 is created with the wallet and the user adds
 * whichever further indexes they want — so this is only the bound that keeps a typed index sane and
 * keeps a corrupt stored entry from deriving something absurd. BIP44 allows far more; the cap is
 * about the label ("Account 100") and the input staying comprehensible, not about the key space.
 */
export const accountLimit = 100;

/**
 * Lowest derivation index the add form offers.
 *
 * Index 0 comes with the wallet and is always present, so it is the one index that can never be
 * added — offering it only ever produced the "already in your list" error. Loading still accepts 0,
 * because that is the account every wallet starts with.
 */
export const accountFirst = 1;

/**
 * defaultAccountName - Builds the fallback label for a slot ("Account 1", "Account 2", ...).
 * @param {number} index The derivation index.
 * @returns {string} The localized default label.
 */
export const defaultAccountName = (index: number) => `${T('Dashboard.Account')} ${index + 1}`;

/**
 * normalize - Coerces whatever is in storage into a usable, ordered account list.
 *
 * Anything malformed is dropped rather than thrown on, so a corrupted entry degrades to the default slot instead of locking the user out of their wallet.
 * @param {unknown} parsed The raw parsed JSON value.
 * @returns {Account[]} The valid accounts, ordered by index.
 */
const normalize = (parsed: unknown) => {
    const accounts: Account[] = [];
    const entries: unknown[] = Array.isArray(parsed) ? parsed : [];

    for (const entry of entries) {
        if (typeof entry !== 'object' || entry === null || !('index' in entry) || !('name' in entry)) {
            continue;
        }

        const { index, name } = entry;

        if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= accountLimit) {
            continue;
        }

        if (accounts.some((item) => item.index === index)) {
            continue;
        }

        const emoji = 'emoji' in entry ? entry.emoji : undefined;

        accounts.push({
            index,
            name: typeof name === 'string' && name.trim().length > 0 ? name : defaultAccountName(index),
            ...(typeof emoji === 'string' && emoji.length > 0 && emoji.length <= emojiLimit ? { emoji } : {})
        });
    }

    return accounts.sort((left, right) => left.index - right.index);
};

/**
 * loadAccounts - Reads the saved account list and the active slot.
 *
 * Wallets created before multi-account support only stored a single `Wallet.Name`; that label is migrated onto slot 0 so an upgrade keeps the name the user chose.
 * @returns {Promise<{ accounts: Account[]; active: number }>} The stored accounts (never empty) and the active derivation index.
 */
export const loadAccounts = async () => {
    // Three independent reads, and every one is a Tauri IPC round-trip. Awaited one after another they
    // cost three round-trips of latency on the dashboard's first render to answer one question; they
    // do not depend on each other, so they go together.
    const [stored, legacyName, storedActive] = await Promise.all([getValue('Wallet.Accounts'), getValue('Wallet.Name'), getValue('Wallet.Active')]);

    let accounts: Account[] = [];

    if (stored !== undefined && stored.length > 0) {
        try {
            accounts = normalize(JSON.parse(stored));
        } catch {
            accounts = [];
        }
    }

    if (accounts.length === 0) {
        accounts = [{ index: 0, name: legacyName !== undefined && legacyName.length > 0 ? legacyName : defaultAccountName(0) }];
    }

    const parsedActive = storedActive === undefined ? Number.NaN : Number(storedActive);

    const active = accounts.some((item) => item.index === parsedActive) ? parsedActive : accounts[0].index;

    return { accounts, active };
};

/**
 * saveAccounts - Persists the account list.
 * @param {Account[]} accounts The accounts to store.
 * @returns {Promise<void>} Resolves once written.
 */
export const saveAccounts = async (accounts: Account[]) => {
    await setValue('Wallet.Accounts', JSON.stringify(accounts));
};

/**
 * saveActiveAccount - Persists which slot the dashboard should open on.
 * @param {number} index The active derivation index.
 * @returns {Promise<void>} Resolves once written.
 */
export const saveActiveAccount = async (index: number) => {
    await setValue('Wallet.Active', String(index));
};
