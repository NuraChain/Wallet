/**
 * The namespace half of a WalletConnect session: what a proposal asks for, and what this wallet
 * is able to answer. It is written against plain records rather than the SDK's types so the rules
 * — which chains a session may carry, which methods it may call — can be read and tested on their
 * own, without a relay or a project id in sight.
 */

export const namespaceKey = 'eip155';

export interface ProposalNamespace {
    chains?: string[];
    methods: string[];
    events: string[];
}

export interface SessionNamespace {
    chains: string[];
    accounts: string[];
    methods: string[];
    events: string[];
}

export interface NamespaceRequest {
    required: Record<string, ProposalNamespace>;
    optional: Record<string, ProposalNamespace>;
    known: number[];
    active: number;
    address: string;
}

export interface NamespaceAnswer {
    namespaces?: Record<string, SessionNamespace>;
    missing: string[];
}

export const chainKey = (chainId: number) => `${namespaceKey}:${chainId}`;

export const accountKey = (chainId: number, address: string) => `${namespaceKey}:${chainId}:${address}`;

export const readChainKey = (key: string) => {
    const [family, id] = key.split(':');

    if (family !== namespaceKey) {
        return undefined;
    }

    const parsed = Number(id);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * The methods a session may carry. It is the wallet's own router that decides what actually runs
 * — this list only tells a dApp what to expect, and it holds nothing the router would refuse.
 * eth_sign is absent on purpose: it signs an opaque digest, which is the shape every drainer asks
 * for, and the router turns it down as well.
 */
export const sessionMethods = [
    'eth_accounts',
    'eth_chainId',
    'eth_call',
    'eth_estimateGas',
    'eth_gasPrice',
    'eth_getBalance',
    'eth_getCode',
    'eth_getTransactionByHash',
    'eth_getTransactionCount',
    'eth_getTransactionReceipt',
    'eth_requestAccounts',
    'eth_sendRawTransaction',
    'eth_sendTransaction',
    'eth_signTypedData',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
    'net_version',
    'personal_sign',
    'wallet_addEthereumChain',
    'wallet_getPermissions',
    'wallet_requestPermissions',
    'wallet_revokePermissions',
    'wallet_switchEthereumChain',
    'wallet_watchAsset'
];

export const sessionEvents = ['accountsChanged', 'chainChanged'];

const chainsOf = (key: string, entry: ProposalNamespace) => {
    // A proposal either groups its chains under the family — eip155: { chains: [...] } — or names
    // one chain per key, eip155:56: { methods, events }. Both forms are in the wild.
    const named = readChainKey(key);

    if (named !== undefined) {
        return [named];
    }

    return (entry.chains ?? []).map((chain) => readChainKey(chain)).filter((id): id is number => id !== undefined);
};

const unique = (values: string[]) => [...new Set(values)];

/**
 * Answers a proposal with the namespaces this wallet can honour, or names what it cannot. Every
 * required chain has to be one the wallet knows, because the SDK rejects an approval that drops a
 * required chain — better to refuse with a reason the person can read than to pair into a session
 * whose first request has nowhere to go.
 */
export const approveNamespaces = ({ required, optional, known, active, address }: NamespaceRequest): NamespaceAnswer => {
    const missing: string[] = [];

    for (const key of Object.keys(required)) {
        if (key !== namespaceKey && readChainKey(key) === undefined) {
            missing.push(key);
        }
    }

    const wanted: number[] = [];

    for (const [key, entry] of Object.entries(required)) {
        if (key !== namespaceKey && readChainKey(key) === undefined) {
            continue;
        }

        for (const id of chainsOf(key, entry)) {
            if (known.includes(id)) {
                wanted.push(id);
            } else {
                missing.push(chainKey(id));
            }
        }
    }

    if (missing.length > 0) {
        return { missing: unique(missing) };
    }

    const offered: number[] = [];

    for (const [key, entry] of Object.entries(optional)) {
        if (key !== namespaceKey && readChainKey(key) === undefined) {
            continue;
        }

        for (const id of chainsOf(key, entry)) {
            if (known.includes(id)) {
                offered.push(id);
            }
        }
    }

    // A proposal that asks for nothing this wallet holds is not a session worth having: the dApp
    // wanted some other chain entirely, and every request it made would be refused.
    if (wanted.length === 0 && offered.length === 0) {
        return { missing: [namespaceKey] };
    }

    const chains = [...new Set([...wanted, ...offered, active])].filter((id) => known.includes(id)).sort((left, right) => left - right);

    const asked = [...Object.values(required), ...Object.values(optional)];

    const methods = unique([...sessionMethods, ...Object.values(required).flatMap((entry) => entry.methods)]);

    const events = unique([...sessionEvents, ...asked.flatMap((entry) => entry.events)]);

    return {
        missing: [],

        namespaces: {
            [namespaceKey]: {
                chains: chains.map((id) => chainKey(id)),
                accounts: chains.map((id) => accountKey(id, address)),
                methods,
                events
            }
        }
    };
};

/**
 * The accounts a live session should now be showing. A session is updated rather than rebuilt
 * when the person switches account, so the chains it was approved with are kept as they are.
 */
export const sessionAccounts = (namespace: SessionNamespace, address: string) =>
    namespace.chains.map((key) => {
        const id = readChainKey(key);

        return id === undefined ? key : accountKey(id, address);
    });
