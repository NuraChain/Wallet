import { loadConnections } from './dapp';
import { clearBrowsingData } from './browser';
import { imageCache } from './image';
import { initNetwork } from './network';
import { clearPrices } from './price';
import { lockSession } from './session';
import { clearSiteIcons } from './site.icon';
import { invalidateHistory } from './history.cache';
import { invalidateTokenCache } from './token.cache';
import { removeValues } from '../utility/storage';

import type { StorageKey } from '../type/storage';

/**
 * A record, so a new `StorageKey` fails the type check here until its fate is decided.
 * Kept: only how the app looks on this device, nothing about whose wallet it was.
 */
const fate: Record<StorageKey, 'erase' | 'keep'> = {
    'App.Language': 'keep',
    'App.Theme': 'keep',
    'App.Mouse': 'keep',
    'App.Network': 'erase',
    'App.Networks': 'erase',
    'Wallet.Mnemonic': 'erase',
    'Wallet.Password': 'erase',
    'Wallet.Name': 'erase',
    'Wallet.Accounts': 'erase',
    'Wallet.Active': 'erase',
    'Wallet.Tokens': 'erase',
    'Wallet.TokensHidden': 'erase',
    'Wallet.BackupReminder': 'erase',
    'Browser.View': 'erase',
    'Browser.History': 'erase',
    'Browser.Favorites': 'erase',
    'Browser.Connections': 'erase'
};

// oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
export const erasedKeys = (Object.keys(fate) as StorageKey[]).filter((key) => fate[key] === 'erase');

let erased = false;

/** Storage goes before the lock: locking first would still find the phrase on disk and ask for its password. */
export const eraseWallet = async () => {
    await removeValues(...erasedKeys);

    invalidateHistory();
    invalidateTokenCache();
    clearPrices();
    clearSiteIcons();

    await imageCache.clear().catch(() => undefined);

    // A site's own storage can hold the address it was connected to.
    await clearBrowsingData();

    // Re-read from the emptied storage so in-memory networks and grants do not carry into the next wallet.
    await Promise.all([initNetwork(), loadConnections()]);

    erased = true;

    lockSession();
};

export const takeErased = () => {
    const was = erased;

    erased = false;

    return was;
};
