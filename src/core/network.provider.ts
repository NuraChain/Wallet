import { FallbackProvider, JsonRpcProvider, type AbstractProvider } from 'ethers';

import { getNetwork, getNetworkRevision } from './network';

let providerCache: { id: string; revision: number; provider: AbstractProvider } | undefined;

export const getProvider = () => {
    const network = getNetwork();
    const revision = getNetworkRevision();

    if (providerCache?.id === network.id && providerCache.revision === revision) {
        return providerCache.provider;
    }

    const endpoints = [network.rpcUrl, ...(network.rpcBackups ?? [])].map((url) => url.trim()).filter((url) => url.length > 0);

    const single = (url: string) => new JsonRpcProvider(url, network.chainId, { staticNetwork: true });

    const provider: AbstractProvider =
        endpoints.length > 1
            ? new FallbackProvider(
                  endpoints.map((url, index) => ({ provider: single(url), priority: index + 1, weight: 1, stallTimeout: 1500 })),
                  network.chainId,
                  { quorum: 1 }
              )
            : single(endpoints[0] ?? network.rpcUrl);

    providerCache = { id: network.id, revision, provider };

    return provider;
};
