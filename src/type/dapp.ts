/** The dApp provider: what a page sends, what the wallet answers, and what it asks the user. */

export interface CallSummary {
    selector: string;

    /** The method name, or an empty string when the selector is not one this wallet names. */
    method: string;
    bytes: number;

    /** This call delegates spending power rather than spending it. */
    approval: boolean;
    spender: string;

    /** Who a `transfer` pays; the transaction's own `to` is only the token contract. Not read for
        `transferFrom`, which can move someone else's tokens and so is no plain send. */
    recipient: string;
    amount?: bigint;
    unlimited: boolean;

    /** Takes spending power away rather than handing it over — `approve(spender, 0)` or
        `setApprovalForAll(operator, false)`. It shares a selector with the grant, and the prompt
        used to warn that a site could now take "0 of USDT". */
    revoke: boolean;
}

export interface DappPage {
    label: string;
    origin: string;
}

/**
 * A URL a page tried to open that its webview cannot load — the native layers cancel the
 * navigation and hand it here instead of leaving the page on a dead link.
 */
export type DappLinkHandler = (url: string) => void;

export type DappPromptKind = 'connect' | 'signature' | 'typed' | 'transaction' | 'chain' | 'asset';

export interface DappPrompt {
    id: string;
    kind: DappPromptKind;
    origin: string;

    summary: string;

    transaction?: { to: string; value: string; data: string; fee: string };

    /** `added` and `from` are decided where the request is routed, never by the window drawing
        it: in an extension that window holds its own copy of the network list and the current
        network, and the worker is the one that changes both. */
    chain?: { name: string; id: number; rpc: string; added: boolean; from: { name: string; id: number } };

    asset?: { address: string; symbol: string; decimals: number };
}

export interface DappIdentity {
    name: string;
    rdns: string;
    icon: string;
    chainId: string;

    /** Which way back to the wallet the page has. Decided at build time, not sniffed. */
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
