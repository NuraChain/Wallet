import { T } from './language';
import { getValue, setValue } from './storage';

/**
 * A single derivable account.
 *
 * `index` is the BIP44 address index used by `WalletManager` (`m/44'/60'/0'/0/{index}`), so the whole account list is reproducible from the one mnemonic — nothing extra is persisted beyond the label.
 */
export interface Account
{
    index: number;
    name: string;
}

/**
 * How many accounts a wallet may keep. Slots map one-to-one onto derivation indexes `0 .. accountLimit - 1`.
 */
export const accountLimit = 3;

/**
 * defaultAccountName - Builds the fallback label for a slot ("Account 1", "Account 2", ...).
 * @param {number} index The derivation index.
 * @returns {string} The localized default label.
 */
export const defaultAccountName = (index: number) => `${ T('Dashboard.Account') } ${ index + 1 }`;

/**
 * normalize - Coerces whatever is in storage into a usable, ordered account list.
 *
 * Anything malformed is dropped rather than thrown on, so a corrupted entry degrades to the default slot instead of locking the user out of their wallet.
 * @param {unknown} parsed The raw parsed JSON value.
 * @returns {Account[]} The valid accounts, ordered by index.
 */
const normalize = (parsed: unknown) =>
{
    const accounts: Account[] = [];
    const entries: unknown[] = Array.isArray(parsed) ? parsed : [];

    for (const entry of entries)
    {
        if (typeof entry !== 'object' || entry === null || !('index' in entry) || !('name' in entry))
        {
            continue;
        }

        const { index, name } = entry;

        if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= accountLimit)
        {
            continue;
        }

        if (accounts.some((item) => item.index === index))
        {
            continue;
        }

        accounts.push({ index, name: typeof name === 'string' && name.trim().length > 0 ? name : defaultAccountName(index) });
    }

    return accounts.sort((left, right) => left.index - right.index);
};

/**
 * loadAccounts - Reads the saved account list and the active slot.
 *
 * Wallets created before multi-account support only stored a single `Wallet.Name`; that label is migrated onto slot 0 so an upgrade keeps the name the user chose.
 * @returns {Promise<{ accounts: Account[]; active: number }>} The stored accounts (never empty) and the active derivation index.
 */
export const loadAccounts = async() =>
{
    const stored = await getValue('Wallet.Accounts');

    let accounts: Account[] = [];

    if (stored !== undefined && stored.length > 0)
    {
        try
        {
            accounts = normalize(JSON.parse(stored));
        }
        catch
        {
            accounts = [];
        }
    }

    if (accounts.length === 0)
    {
        const legacy = await getValue('Wallet.Name');

        accounts = [ { index: 0, name: legacy !== undefined && legacy.length > 0 ? legacy : defaultAccountName(0) } ];
    }

    const storedActive = await getValue('Wallet.Active');
    const parsedActive = storedActive === undefined ? Number.NaN : Number(storedActive);

    const active = accounts.some((item) => item.index === parsedActive) ? parsedActive : accounts[0].index;

    return { accounts, active };
};

/**
 * saveAccounts - Persists the account list.
 * @param {Account[]} accounts The accounts to store.
 * @returns {Promise<void>} Resolves once written.
 */
export const saveAccounts = async(accounts: Account[]) =>
{
    await setValue('Wallet.Accounts', JSON.stringify(accounts));
};

/**
 * saveActiveAccount - Persists which slot the dashboard should open on.
 * @param {number} index The active derivation index.
 * @returns {Promise<void>} Resolves once written.
 */
export const saveActiveAccount = async(index: number) =>
{
    await setValue('Wallet.Active', String(index));
};
