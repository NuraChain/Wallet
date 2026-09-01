import { ethers } from 'ethers';
import { useSyncExternalStore } from 'react';

import { getVault } from './session';
import { dappLog } from './dapp.log';
import { vaultManager } from './vault';
import { httpRequest } from './request';
import { getProvider } from './network.provider';
import { emitDappEvent, getDappPages } from './dapp.bridge';
import { addNetwork, getNetwork, getNetworks, setNetwork } from './network';
import {
    DappError,
    clearConnections,
    dappError,
    failure,
    getConnections,
    grantConnection,
    isConnected,
    revokeConnection,
    type DappEnvelope,
    type DappFailure,
    type DappReply
} from './dapp';

export type DappPromptKind = 'connect' | 'signature' | 'typed' | 'transaction' | 'chain' | 'asset';

export interface DappPrompt {
    id: string;
    kind: DappPromptKind;
    origin: string;

    summary: string;

    transaction?: { to: string; value: string; data: string; fee: string };

    chain?: { name: string; id: number; rpc: string };

    asset?: { address: string; symbol: string; decimals: number };
}

const readMethods = new Set([
    'eth_blobBaseFee',
    'eth_blockNumber',
    'eth_call',
    'eth_createAccessList',
    'eth_estimateGas',
    'eth_feeHistory',
    'eth_gasPrice',
    'eth_getBalance',
    'eth_getBlockByHash',
    'eth_getBlockByNumber',
    'eth_getBlockReceipts',
    'eth_getBlockTransactionCountByHash',
    'eth_getBlockTransactionCountByNumber',
    'eth_getCode',
    'eth_getLogs',
    'eth_getProof',
    'eth_getStorageAt',
    'eth_getTransactionByBlockHashAndIndex',
    'eth_getTransactionByBlockNumberAndIndex',
    'eth_getTransactionByHash',
    'eth_getTransactionCount',
    'eth_getTransactionReceipt',
    'eth_getUncleCountByBlockHash',
    'eth_getUncleCountByBlockNumber',
    'eth_maxPriorityFeePerGas',
    'eth_sendRawTransaction',
    'eth_syncing',
    'net_listening',
    'net_peerCount',
    'web3_sha3'
]);

let activeAddress = '';
let activeAccount = 0;

let toldAddress = '';
let toldChain = 0;

let watchAsset: ((address: string) => Promise<boolean>) | undefined;

export const setDappAccount = (address: string, index: number) => {
    activeAddress = address;
    activeAccount = index;
};

export const getDappAccount = () => activeAddress;

export const setDappWatchAsset = (handler: (address: string) => Promise<boolean>) => {
    watchAsset = handler;
};

const chainHex = (id: number) => `0x${id.toString(16)}`;

const promptListeners = new Set<() => void>();

const changeListeners = new Set<() => void>();

export const subscribeDappChange = (listener: () => void) => {
    changeListeners.add(listener);

    return () => {
        changeListeners.delete(listener);
    };
};

const announceChange = () => {
    for (const listener of changeListeners) {
        listener();
    }
};

let prompts: DappPrompt[] = [];

const waiting = new Map<string, (approved: boolean) => void>();

const announcePrompts = () => {
    for (const listener of promptListeners) {
        listener();
    }
};

const subscribePrompts = (listener: () => void) => {
    promptListeners.add(listener);

    return () => {
        promptListeners.delete(listener);
    };
};

export const getDappPrompt = () => prompts[0];

export const useDappPrompt = () => useSyncExternalStore(subscribePrompts, getDappPrompt, getDappPrompt);

const settle = (id: string, approved: boolean) => {
    const release = waiting.get(id);

    if (release === undefined) {
        return;
    }

    waiting.delete(id);

    prompts = prompts.filter((item) => item.id !== id);

    announcePrompts();

    release(approved);
};

export const resolveDappPrompt = (id: string, approved: boolean) => {
    settle(id, approved);
};

export const rejectDappPrompts = () => {
    for (const id of [...waiting.keys()]) {
        settle(id, false);
    }
};

const ask = async (detail: Omit<DappPrompt, 'id'>) =>
    new Promise<boolean>((resolve) => {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

        waiting.set(id, resolve);

        prompts = [...prompts, { ...detail, id }];

        announcePrompts();
    });

const approve = async (detail: Omit<DappPrompt, 'id'>) => {
    const allowed = await ask(detail);

    if (!allowed) {
        throw failure(dappError.rejected, 'The user rejected the request');
    }
};

const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
    const network = getNetwork();

    const endpoints = [network.rpcUrl, ...(network.rpcBackups ?? [])].map((url) => url.trim()).filter((url) => url.length > 0);

    let reached = false;

    for (const url of endpoints) {
        let body: unknown;

        try {
            // oxlint-disable-next-line no-await-in-loop
            const response = await httpRequest(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
            });

            if (!response.ok) {
                continue;
            }

            // oxlint-disable-next-line no-await-in-loop
            body = await response.json();
        } catch {
            continue;
        }

        reached = true;

        if (typeof body !== 'object' || body === null) {
            continue;
        }

        if ('error' in body && typeof body.error === 'object' && body.error !== null) {
            const detail = body.error;

            const code = 'code' in detail && typeof detail.code === 'number' ? detail.code : dappError.internal;
            const message = 'message' in detail && typeof detail.message === 'string' ? detail.message : 'The node rejected the request';

            throw failure(code, message, 'data' in detail ? detail.data : undefined);
        }

        return 'result' in body ? body.result : null;
    }

    throw failure(reached ? dappError.internal : dappError.disconnected, reached ? 'No endpoint returned a usable answer' : `Could not reach ${network.name}`);
};

const signerFor = () => {
    const vault = getVault();

    if (vault === undefined) {
        throw failure(dappError.unauthorized, 'The wallet is locked');
    }

    return new ethers.Wallet(vaultManager(vault, activeAccount).retrieve().Private, getProvider());
};

const requireGrant = (origin: string) => {
    if (!isConnected(origin)) {
        throw failure(dappError.unauthorized, 'Connect to Nura Wallet before calling this method');
    }

    if (activeAddress.length === 0) {
        throw failure(dappError.unauthorized, 'The wallet is locked');
    }
};

const permissions = () => [{ parentCapability: 'eth_accounts', invoker: '', caveats: [{ type: 'restrictReturnedAccounts', value: [activeAddress] }] }];

const readAddress = (value: unknown) => {
    if (typeof value !== 'string' || !ethers.isAddress(value)) {
        throw failure(dappError.invalidParams, 'Expected an address');
    }

    return ethers.getAddress(value);
};

const matchesAccount = (value: unknown) => typeof value === 'string' && ethers.isAddress(value) && ethers.getAddress(value) === activeAddress;

const readable = (value: string) => {
    if (!ethers.isHexString(value)) {
        return value;
    }

    try {
        return ethers.toUtf8String(value);
    } catch {
        return value;
    }
};

const signBytes = (value: string) => (ethers.isHexString(value) ? ethers.getBytes(value) : value);

const typedPayload = (value: unknown) => {
    let parsed: unknown = value;

    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            throw failure(dappError.invalidParams, 'Typed data is not valid JSON');
        }
    }

    if (typeof parsed !== 'object' || parsed === null || !('domain' in parsed) || !('types' in parsed) || !('message' in parsed)) {
        throw failure(dappError.invalidParams, 'Typed data must carry a domain, types and message');
    }

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const payload = parsed as { domain: ethers.TypedDataDomain; types: Record<string, ethers.TypedDataField[]>; message: Record<string, unknown> };

    const declared = payload.domain.chainId;

    if (declared !== undefined && declared !== null) {
        const asNumber = Number(declared);

        if (Number.isFinite(asNumber) && asNumber !== getNetwork().chainId) {
            throw failure(dappError.invalidInput, 'Typed data is for a different chain than the wallet is on');
        }
    }

    const types = { ...payload.types };

    delete types.EIP712Domain;

    return { domain: payload.domain, types, message: payload.message };
};

const transactionRequest = (value: unknown): ethers.TransactionRequest => {
    if (typeof value !== 'object' || value === null) {
        throw failure(dappError.invalidParams, 'Expected a transaction object');
    }

    const input: Record<string, unknown> = { ...value };

    if (input.from !== undefined && !matchesAccount(input.from)) {
        throw failure(dappError.unauthorized, 'Nura Wallet can only sign for the active account');
    }

    const request: ethers.TransactionRequest = { from: activeAddress };

    const quantity = (key: string) => {
        const raw = input[key];

        if (raw === undefined || raw === null || raw === '') {
            return undefined;
        }

        try {
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            return BigInt(raw as string | number);
        } catch {
            throw failure(dappError.invalidParams, `Could not read ${key}`);
        }
    };

    if (input.to !== undefined && input.to !== null && input.to !== '') {
        request.to = readAddress(input.to);
    }

    if (typeof input.data === 'string' && input.data.length > 0) {
        if (!ethers.isHexString(input.data)) {
            throw failure(dappError.invalidParams, 'Transaction data is not a hex string');
        }

        request.data = input.data;
    }

    request.value = quantity('value') ?? 0n;

    const gas = quantity('gas') ?? quantity('gasLimit');

    if (gas !== undefined) {
        request.gasLimit = gas;
    }

    const nonce = quantity('nonce');

    if (nonce !== undefined) {
        request.nonce = Number(nonce);
    }

    const maxFee = quantity('maxFeePerGas');
    const maxPriority = quantity('maxPriorityFeePerGas');

    if (maxFee !== undefined || maxPriority !== undefined) {
        request.maxFeePerGas = maxFee;
        request.maxPriorityFeePerGas = maxPriority;
    } else {
        const price = quantity('gasPrice');

        if (price !== undefined) {
            request.gasPrice = price;
        }
    }

    return request;
};

const estimateFee = async (request: ethers.TransactionRequest) => {
    const network = getNetwork();

    try {
        const provider = getProvider();

        const [limit, fees] = await Promise.all([
            request.gasLimit === undefined || request.gasLimit === null ? provider.estimateGas(request) : Promise.resolve(BigInt(request.gasLimit)),
            provider.getFeeData()
        ]);

        const price = fees.maxFeePerGas ?? fees.gasPrice;

        if (price === null || price === undefined) {
            return '';
        }

        return `${ethers.formatUnits(limit * price, network.decimals)} ${network.symbol}`;
    } catch {
        return '';
    }
};

const privateAddress = (host: string) => {
    const name = host.replaceAll(/^\[|\]$/gu, '').toLowerCase();

    if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local') || name.endsWith('.internal') || name.endsWith('.home.arpa')) {
        return true;
    }

    if (name.includes(':')) {
        return name === '::' || name === '::1' || /^f[cd]/u.test(name) || /^fe[89ab]/u.test(name) || name.startsWith('::ffff:');
    }

    const octets = name.split('.').map(Number);

    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
    }

    const [first, second] = octets;

    return (
        first === 0 ||
        first === 127 ||
        first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254) ||
        (first === 100 && second >= 64 && second <= 127)
    );
};

const siteSuppliedUrl = (url: string) => {
    try {
        const parsed = new URL(url);

        return parsed.protocol === 'https:' && !privateAddress(parsed.hostname);
    } catch {
        return false;
    }
};

const networkFrom = (value: unknown) => {
    if (typeof value !== 'object' || value === null || !('chainId' in value)) {
        throw failure(dappError.invalidParams, 'Expected a chain description');
    }

    const input: Record<string, unknown> = { ...value };

    const id = typeof input.chainId === 'string' ? Number.parseInt(input.chainId, 16) : Number(input.chainId);

    if (!Number.isInteger(id) || id <= 0) {
        throw failure(dappError.invalidParams, 'Chain id is not a positive integer');
    }

    const urls = Array.isArray(input.rpcUrls) ? input.rpcUrls.filter((url): url is string => typeof url === 'string' && siteSuppliedUrl(url)) : [];

    if (urls.length === 0) {
        throw failure(dappError.invalidParams, 'At least one https RPC URL is required, and it may not point at a private or loopback address');
    }

    const currency = typeof input.nativeCurrency === 'object' && input.nativeCurrency !== null ? input.nativeCurrency : {};

    const symbol = 'symbol' in currency && typeof currency.symbol === 'string' && currency.symbol.length > 0 ? currency.symbol : 'ETH';
    const decimals = 'decimals' in currency && typeof currency.decimals === 'number' ? currency.decimals : 18;

    const explorers = Array.isArray(input.blockExplorerUrls)
        ? input.blockExplorerUrls.filter((url): url is string => typeof url === 'string' && siteSuppliedUrl(url))
        : [];

    return {
        id,
        network: {
            name: typeof input.chainName === 'string' && input.chainName.length > 0 ? input.chainName : `Chain ${id}`,
            chainId: id,
            symbol,
            rpcUrl: urls[0],
            rpcBackups: urls.slice(1),
            explorerUrl: explorers[0] ?? '',
            decimals
        }
    };
};

const broadcast = () => {
    const chain = getNetwork().chainId;

    const chainMoved = chain !== toldChain;
    const accountMoved = activeAddress !== toldAddress;

    toldChain = chain;
    toldAddress = activeAddress;

    for (const page of getDappPages()) {
        if (chainMoved) {
            emitDappEvent(page.label, 'chainChanged', chainHex(chain));
        }

        if (accountMoved && isConnected(page.origin)) {
            emitDappEvent(page.label, 'accountsChanged', [activeAddress]);
        }
    }
};

/**
 * Moves the wallet onto a chain a caller asked for, prompting first. Answers whether the wallet
 * ended up there; a chain it has never heard of is left to the caller to report.
 */
const ensureDappChain = async (chainId: number, origin: string) => {
    if (chainId === getNetwork().chainId) {
        return true;
    }

    const found = getNetworks().find((item) => item.chainId === chainId);

    if (found === undefined) {
        return false;
    }

    await approve({ kind: 'chain', origin, summary: found.name, chain: { name: found.name, id: chainId, rpc: found.rpcUrl } });

    await setNetwork(found.id);

    broadcast();

    announceChange();

    return true;
};

export const syncDappState = () => {
    broadcast();
};

export const disconnectDapp = async (origin: string) => {
    await revokeConnection(origin);

    for (const page of getDappPages()) {
        if (page.origin === origin) {
            emitDappEvent(page.label, 'accountsChanged', []);
        }
    }
};

export const disconnectAllDapps = async () => {
    const dropped = new Set(getConnections());

    await clearConnections();

    for (const page of getDappPages()) {
        if (dropped.has(page.origin)) {
            emitDappEvent(page.label, 'accountsChanged', []);
        }
    }
};

const route = async (envelope: DappEnvelope): Promise<unknown> => {
    const { method, params, origin } = envelope;

    const connected = isConnected(origin) && activeAddress.length > 0;

    if (origin.length === 0) {
        throw failure(dappError.unauthorized, 'Nura Wallet does not serve this page');
    }

    switch (method) {
        case 'eth_chainId':
            return chainHex(getNetwork().chainId);

        case 'net_version':
            return String(getNetwork().chainId);

        case 'eth_accounts':
            return connected ? [activeAddress] : [];

        case 'eth_coinbase':
            return connected ? activeAddress : null;

        case 'wallet_getPermissions':
            return connected ? permissions() : [];

        case 'web3_clientVersion':
            return `NuraWallet/${__APP_VERSION__}`;

        case 'eth_requestAccounts':
        case 'wallet_requestPermissions': {
            if (activeAddress.length === 0) {
                throw failure(dappError.unauthorized, 'The wallet is locked');
            }

            if (!connected) {
                await approve({ kind: 'connect', origin, summary: origin });

                await grantConnection(origin);

                for (const page of getDappPages()) {
                    if (page.origin === origin && page.label !== envelope.label) {
                        emitDappEvent(page.label, 'accountsChanged', [activeAddress]);
                    }
                }
            }

            return method === 'eth_requestAccounts' ? [activeAddress] : permissions();
        }

        case 'wallet_revokePermissions': {
            await disconnectDapp(origin);

            return null;
        }

        case 'personal_sign': {
            requireGrant(origin);

            const [first, second] = params;

            const swapped = matchesAccount(first);

            const payload = swapped ? second : first;
            const signWith = swapped ? first : second;

            if (typeof payload !== 'string') {
                throw failure(dappError.invalidParams, 'Expected a message to sign');
            }

            if (signWith !== undefined && !matchesAccount(signWith)) {
                throw failure(dappError.unauthorized, 'Nura Wallet can only sign for the active account');
            }

            await approve({ kind: 'signature', origin, summary: readable(payload) });

            return signerFor().signMessage(signBytes(payload));
        }

        case 'eth_sign':
            throw failure(dappError.unsupported, 'eth_sign is not supported; use personal_sign or eth_signTypedData_v4');

        case 'eth_signTypedData':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v4': {
            requireGrant(origin);

            const [first, second] = params;

            const swapped = !matchesAccount(first) && matchesAccount(second);

            const signWith = swapped ? second : first;
            const payload = swapped ? first : second;

            if (!matchesAccount(signWith)) {
                throw failure(dappError.unauthorized, 'Nura Wallet can only sign for the active account');
            }

            const typed = typedPayload(payload);

            await approve({ kind: 'typed', origin, summary: JSON.stringify(typed.message, null, 2) });

            return signerFor().signTypedData(typed.domain, typed.types, typed.message);
        }

        case 'eth_sendTransaction': {
            requireGrant(origin);

            const request = transactionRequest(params[0]);

            const network = getNetwork();

            const fee = await estimateFee(request);

            await approve({
                kind: 'transaction',
                origin,
                summary: `${ethers.formatUnits(request.value ?? 0n, network.decimals)} ${network.symbol}`,
                transaction: {
                    to: typeof request.to === 'string' ? request.to : '',
                    value: `${ethers.formatUnits(request.value ?? 0n, network.decimals)} ${network.symbol}`,
                    data: typeof request.data === 'string' ? request.data : '',
                    fee
                }
            });

            const sent = await signerFor().sendTransaction(request);

            return sent.hash;
        }

        case 'wallet_switchEthereumChain': {
            const target = params[0];

            if (typeof target !== 'object' || target === null || !('chainId' in target) || typeof target.chainId !== 'string') {
                throw failure(dappError.invalidParams, 'Expected a hex chain id');
            }

            const id = Number.parseInt(target.chainId, 16);

            if (!Number.isInteger(id)) {
                throw failure(dappError.invalidParams, 'Chain id is not a hex number');
            }

            if (!(await ensureDappChain(id, origin))) {
                throw failure(dappError.chainMissing, 'Nura Wallet does not know this chain', { chainId: target.chainId });
            }

            return null;
        }

        case 'wallet_addEthereumChain': {
            const { network, id } = networkFrom(params[0]);

            const known = getNetworks().find((item) => item.chainId === id);

            if (known !== undefined) {
                await ensureDappChain(id, origin);

                return null;
            }

            await approve({ kind: 'chain', origin, summary: network.name, chain: { name: network.name, id, rpc: network.rpcUrl } });

            await addNetwork(network);

            broadcast();

            announceChange();

            return null;
        }

        case 'wallet_watchAsset': {
            const request = params[0];

            if (typeof request !== 'object' || request === null || !('options' in request)) {
                throw failure(dappError.invalidParams, 'Expected a watchAsset request');
            }

            const options = request.options;

            if (typeof options !== 'object' || options === null || !('address' in options)) {
                throw failure(dappError.invalidParams, 'Expected a token address');
            }

            const address = readAddress(options.address);

            const symbol = 'symbol' in options && typeof options.symbol === 'string' ? options.symbol : '';
            const decimals = 'decimals' in options && typeof options.decimals === 'number' ? options.decimals : 18;

            await approve({ kind: 'asset', origin, summary: symbol.length > 0 ? symbol : address, asset: { address, symbol, decimals } });

            return watchAsset === undefined ? false : watchAsset(address);
        }

        default: {
            if (readMethods.has(method)) {
                return rpc(method, params);
            }

            throw failure(dappError.unsupported, `Nura Wallet does not support ${method}`);
        }
    }
};

const describe = (cause: unknown): DappFailure => {
    if (cause instanceof DappError) {
        return { code: cause.code, message: cause.message, ...(cause.data === undefined ? {} : { data: cause.data }) };
    }

    if (cause instanceof Error) {
        return { code: dappError.internal, message: cause.message };
    }

    return { code: dappError.internal, message: String(cause) };
};

export const answerDapp = async (envelope: DappEnvelope): Promise<DappReply> => {
    dappLog('Wallet', 'request', { id: envelope.id, method: envelope.method, origin: envelope.origin, label: envelope.label });

    try {
        const result = await route(envelope);

        dappLog('Wallet', 'answered', { id: envelope.id, method: envelope.method, empty: result === null || result === undefined });

        return { id: envelope.id, result };
    } catch (cause) {
        const error = describe(cause);

        dappLog('Wallet', 'refused', { id: envelope.id, method: envelope.method, code: error.code, message: error.message });

        return { id: envelope.id, error };
    }
};
