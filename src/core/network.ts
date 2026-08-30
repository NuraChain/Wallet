import { setValue, getValue } from '../utility/storage';

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

export const nuraChainId = 1020;

export const defaultNetworks: Network[] = [
    {
        id: 'nura',
        name: 'Nura Chain',
        chainId: nuraChainId,
        symbol: 'Nura',
        coin: 'Nura Coin',
        rpcUrl: 'https://rpc.nurachain.net',
        explorerUrl: 'https://explorer.nurachain.net',
        explorerApi: 'https://explorer.nurachain.net/api',
        decimals: 18,
        custom: false
    },
    {
        id: 'ethereum',
        name: 'Ethereum',
        chainId: 1,
        symbol: 'ETH',
        rpcUrl: 'https://ethereum.publicnode.com',
        rpcBackups: ['https://eth.drpc.org', 'https://cloudflare-eth.com', 'https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
        explorerUrl: 'https://etherscan.io',
        explorerApi: 'https://eth.blockscout.com/api',
        decimals: 18,
        custom: false
    },
    {
        id: 'bnb',
        name: 'BNB Smart Chain',
        chainId: 56,
        symbol: 'BNB',
        rpcUrl: 'https://bsc-dataseed.binance.org',
        rpcBackups: ['https://bsc-rpc.publicnode.com', 'https://bsc.publicnode.com'],
        explorerUrl: 'https://bscscan.com',
        explorerApi: 'https://api.etherscan.io/v2/api?chainid=56',
        decimals: 18,
        custom: false
    }
];

let customNetworks: Network[] = [];
let networkCurrentId: string = defaultNetworks[0].id;

let networkRevision = 0;

export const getNetworkRevision = () => networkRevision;

export const getNetworks = () => [...defaultNetworks, ...customNetworks];

export const getNetwork = () => getNetworks().find((item) => item.id === networkCurrentId) ?? defaultNetworks[0];

export const getExplorerApi = (network: Network) => {
    const guessed = network.explorerUrl.length === 0 ? '' : `${network.explorerUrl.replace(/\/+$/, '')}/api`;

    const base = network.explorerApi !== undefined && network.explorerApi.length > 0 ? network.explorerApi : guessed;

    if (base.length === 0 || network.explorerKey === undefined || network.explorerKey.length === 0) {
        return base;
    }

    return `${base}${base.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(network.explorerKey)}`;
};

const persistCustom = async () => {
    await setValue('App.Networks', JSON.stringify(customNetworks));
};

export const setNetwork = async (id: string) => {
    if (!getNetworks().some((item) => item.id === id)) {
        return;
    }

    networkCurrentId = id;

    await setValue('App.Network', id);
};

export const addNetwork = async (input: Omit<Network, 'id' | 'custom'>) => {
    const network: Network = { ...input, id: `custom-${input.chainId}`, custom: true };

    customNetworks = [...customNetworks.filter((item) => item.id !== network.id), network];

    networkRevision += 1;

    await persistCustom();

    await setNetwork(network.id);

    return network;
};

export const removeNetwork = async (id: string) => {
    const target = customNetworks.find((item) => item.id === id);

    if (target === undefined) {
        return;
    }

    customNetworks = customNetworks.filter((item) => item.id !== id);

    networkRevision += 1;

    await persistCustom();

    if (networkCurrentId === id) {
        await setNetwork(defaultNetworks[0].id);
    }
};

export const initNetwork = async () => {
    const storedNetworks = await getValue('App.Networks').catch(() => undefined);

    if (storedNetworks !== undefined) {
        try {
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const parsed = JSON.parse(storedNetworks) as Network[];

            if (Array.isArray(parsed)) {
                customNetworks = parsed
                    .filter((item) => typeof item.id === 'string' && typeof item.chainId === 'number' && typeof item.rpcUrl === 'string')
                    .map((item) => ({
                        ...item,
                        rpcBackups: Array.isArray(item.rpcBackups)
                            ? item.rpcBackups.filter((url): url is string => typeof url === 'string' && url.length > 0)
                            : []
                    }));
            }
        } catch {
            customNetworks = [];
        }
    }

    const storedCurrent = await getValue('App.Network').catch(() => undefined);

    if (storedCurrent !== undefined && getNetworks().some((item) => item.id === storedCurrent)) {
        networkCurrentId = storedCurrent;
    }
};
