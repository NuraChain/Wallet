import { T } from './language';
import { getValue, setValue } from './storage';

export interface Account {
    index: number;
    name: string;
    emoji?: string;
}

const emojiLimit = 16;

export const accountLimit = 100;

export const accountFirst = 1;

export const defaultAccountName = (index: number) => `${T('Dashboard.Account')} ${index + 1}`;

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

export const loadAccounts = async () => {
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

export const saveAccounts = async (accounts: Account[]) => {
    await setValue('Wallet.Accounts', JSON.stringify(accounts));
};

export const saveActiveAccount = async (index: number) => {
    await setValue('Wallet.Active', String(index));
};
