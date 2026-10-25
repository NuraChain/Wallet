/** A token the swap can trade; an empty `address` is the chain's native coin. */
export interface SwapAsset {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
}

/** `wrap` and `unwrap` go through WNURA itself; only `swap` touches the router. */
export type SwapKind = 'wrap' | 'unwrap' | 'swap';

export interface SwapQuote {
    kind: SwapKind;
    amountIn: bigint;
    amountOut: bigint;

    /** The pool's fee tier in hundredths of a basis point; 0 for a wrap. */
    fee: number;

    /** The quoter's own estimate of the pool's gas, before the router's. */
    gas: bigint;
}

export interface SwapPlan {
    from: SwapAsset;
    to: SwapAsset;
    quote: SwapQuote;

    /** The least the router may hand back before the swap reverts. */
    minimum: bigint;
}
