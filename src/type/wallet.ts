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

/** Why the shop refused a code; `failed` covers a network error or an answer it could not read. */
export type RedeemFailure = 'validation' | 'not-found' | 'conflict' | 'rate-limited';

/** A redeemed code's USDT payout is queued, not sent: the shop's operator transfers it by hand. */
export type RedeemResult = { ok: true; amount: number; wallet: string; notified: boolean } | { ok: false; reason: RedeemFailure | 'failed' };

export type VaultKind = 'mnemonic' | 'privateKey';

export interface Vault {
    kind: VaultKind;
    secret: string;
}

export interface SendParams {
    to: string;
    amount: string;

    /** The native token's own decimals, never assumed to be 18. */
    decimals: number;
    token?: { address: string; decimals: number };
}

export interface Account {
    index: number;
    name: string;
    emoji?: string;
}
