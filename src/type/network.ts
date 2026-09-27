/** A chain the wallet can be on. */

export interface Network {
    id: string;
    name: string;
    chainId: number;
    symbol: string;
    coin?: string;
    rpcUrl: string;
    rpcBackups?: string[];
    explorerUrl: string;
    explorerApi?: string;
    explorerKey?: string;
    decimals: number;
    custom: boolean;
}
