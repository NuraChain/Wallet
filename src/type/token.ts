/** Tokens, their prices, and the kinds of image the cache holds for them. */

export type ImageKind = 'network' | 'token' | 'nft' | 'unknown';

export type PriceMap = Record<string, number>;

export interface PriceRead {
    prices: PriceMap;
    at: number;
}

export interface Token {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    coinId: string;
}

export interface TokenBalance {
    token: Token;
    value: bigint;
    formatted: string;
}

export type TokenMap = Record<number, Token[]>;

export type HiddenMap = Record<number, string[]>;
