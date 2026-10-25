export interface CallSummary {
    selector: string;

    /** Empty when the selector is not one this wallet names. */
    method: string;
    bytes: number;

    approval: boolean;
    spender: string;

    /** Set for `transfer` only; the transaction's `to` is just the token contract. */
    recipient: string;
    amount?: bigint;
    unlimited: boolean;

    /** `approve(spender, 0)` or `setApprovalForAll(operator, false)`, which share the grant's selector. */
    revoke: boolean;
}

export interface DappPage {
    label: string;
    origin: string;
}

export type DappLinkHandler = (url: string) => void;

export type DappPromptKind = 'connect' | 'signature' | 'typed' | 'transaction' | 'chain' | 'asset' | 'microphone';

/** Decimal strings: `limit` in gas units, the rest in wei — a bigint does not survive a worker boundary. */
export interface DappGas {
    limit: string;

    /** The gas price, or on an EIP-1559 chain the most a unit of gas may cost. */
    price: string;

    /** The tip, set only on an EIP-1559 chain. */
    priority?: string;
}

export interface DappAnswer {
    approved: boolean;

    /** Set only when the user changed the suggested gas. */
    gas?: DappGas;
}

export interface DappPrompt {
    id: string;
    kind: DappPromptKind;
    origin: string;

    summary: string;

    /** `gas` is the suggestion the fee was worked out from, absent when the chain could not estimate one. */
    transaction?: { to: string; value: string; data: string; fee: string; gas?: DappGas & { symbol: string; decimals: number } };

    /** `added` and `from` are decided where the request is routed, never by the window drawing it. */
    chain?: { name: string; id: number; rpc: string; added: boolean; from: { name: string; id: number } };

    asset?: { address: string; symbol: string; decimals: number };
}

export interface DappIdentity {
    name: string;
    rdns: string;
    icon: string;
    chainId: string;

    /** Decided at build time, not sniffed. */
    channel?: 'native' | 'extension';
}

export interface DappEnvelope {
    id: string;
    label: string;
    origin: string;
    method: string;
    params: unknown[];
}

export interface DappFailure {
    code: number;
    message: string;
    data?: unknown;
}

export interface DappReply {
    id: string;
    result?: unknown;
    error?: DappFailure;
}
