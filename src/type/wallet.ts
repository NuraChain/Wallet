/** The unlocked wallet: its vault, accounts, sends, history and redeem codes. */

export interface Transaction {
    id: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    symbol: string;
    timestamp: number;
    incoming: boolean;
}

export type RedeemResult = { ok: true; message: string } | { ok: false; message: string };

export type VaultKind = 'mnemonic' | 'privateKey';

export interface Vault {
    kind: VaultKind;
    secret: string;
}

export interface SendParams {
    to: string;
    amount: string;

    /** The native token's own decimals. This used to be hardcoded to 18 through `parseEther`, so
        on a chain that uses anything else the amount confirmed was not the amount broadcast. */
    decimals: number;
    token?: { address: string; decimals: number };
}

export interface Account {
    index: number;
    name: string;
    emoji?: string;
}
