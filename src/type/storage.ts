/** Kept apart from `storage.ts` so the platform layer can name keys without importing it. */
export type StorageKey =
    | 'App.Language'
    | 'App.Theme'
    | 'App.Network'
    | 'App.Networks'
    | 'App.Mouse'
    | 'Wallet.Mnemonic'
    | 'Wallet.Password'
    | 'Wallet.Name'
    | 'Wallet.Accounts'
    | 'Wallet.Active'
    | 'Wallet.Tokens'
    | 'Wallet.TokensHidden'
    | 'Wallet.BackupReminder'
    | 'Browser.View'
    | 'Browser.History'
    | 'Browser.Favorites'
    | 'Browser.Connections';
