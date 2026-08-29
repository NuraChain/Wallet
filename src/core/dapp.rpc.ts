import { ethers } from 'ethers';
import { useSyncExternalStore } from 'react';

import { getVault } from './session';
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

/**
 * What a pending dialog is asking the user to allow.
 *
 * One kind per shape of answer rather than per method, because several methods ask the same question:
 * `eth_requestAccounts` and `wallet_requestPermissions` are both `connect`, and the three
 * `eth_signTypedData` versions are all `typed`.
 */
export type DappPromptKind = 'connect' | 'signature' | 'typed' | 'transaction' | 'chain' | 'asset';

/**
 * One request waiting on the user.
 *
 * `origin` is what the sheet leads with, because it is the only part of this the user can actually
 * judge — the difference between the site they opened and one that opened itself in a frame is the
 * whole of what a signing prompt protects.
 */
export interface DappPrompt {
    id: string;
    kind: DappPromptKind;
    origin: string;

    /** The thing being signed, added or switched to, already in the form the sheet shows. */
    summary: string;

    /** Present for `transaction`, and the reason that sheet is taller than the others. */
    transaction?: { to: string; value: string; data: string; fee: string };

    /**
     * Present for `chain`: the network being switched to or added.
     *
     * `rpc` is here because a chain name is not something a user can check. Approving this points
     * every balance read, gas estimate and broadcast at that endpoint, so it is the endpoint that has
     * to be on screen — a dialog naming only "Foo Chain, 1234" asks for consent to something it has
     * not disclosed.
     */
    chain?: { name: string; id: number; rpc: string };

    /** Present for `asset`: the token a site is asking the wallet to track. */
    asset?: { address: string; symbol: string; decimals: number };
}

/**
 * Methods answered straight off the active network's RPC, and the whole of what a page may ask it.
 *
 * A whitelist rather than a passthrough, deliberately. Forwarding whatever arrives would hand every
 * page whatever the node happens to expose — `personal_unlockAccount` on a node that has accounts,
 * `admin_*` and `debug_*` on one that was started carelessly, and every future method nobody has
 * reviewed. Everything here reads public chain state, which is why none of it needs a grant: a page
 * can read the same data by talking to any public node, and refusing it would only break dApps
 * without protecting anything.
 *
 * `eth_sendRawTransaction` sits here because the transaction it carries is already signed — by a key
 * this wallet does not hold, or the page would have had to ask for a signature first — so this is a
 * relay and not an authority.
 */
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

/**
 * The account every connected page is shown, and the derivation index it is signed with.
 *
 * Written by the dashboard rather than read from storage, because the dashboard is what owns the
 * choice: it holds the active slot, it is where switching happens, and a second reader of the same
 * preference would be a second answer able to disagree with the one on screen.
 */
let activeAddress = '';
let activeAccount = 0;

/** What the connected pages were last told, so a sync only speaks when something actually moved. */
let toldAddress = '';
let toldChain = 0;

/**
 * How a site is granted the right to have the wallet track one of its tokens.
 *
 * `wallet_watchAsset` adds a row to the dashboard's token list, and that list is dashboard state — so
 * the work is done by a function the dashboard registers rather than from here. Absent, the method
 * answers `false`, which is the spec's way of saying the wallet declined to track it.
 */
let watchAsset: ((address: string) => Promise<boolean>) | undefined;

/**
 * setDappAccount - Tells the provider which account connected pages are looking at.
 * @param {string} address The active account's address.
 * @param {number} index Its derivation index, used to build a signer.
 * @returns {void}
 */
export const setDappAccount = (address: string, index: number) => {
    activeAddress = address;
    activeAccount = index;
};

/**
 * setDappWatchAsset - Registers what should happen when a site asks the wallet to track a token.
 * @param {(address: string) => Promise<boolean>} handler Adds the token and reports whether it worked.
 * @returns {void}
 */
export const setDappWatchAsset = (handler: (address: string) => Promise<boolean>) => {
    watchAsset = handler;
};

/**
 * chainHex - The active chain id as EIP-695 requires it.
 *
 * Written by hand rather than through `toBeHex`, which pads to whole bytes: chain 1 has to read `0x1`,
 * and `0x01` is a leading zero the spec forbids and some dApps compare against literally.
 * @param {number} id The chain id.
 * @returns {string} The minimal hex form.
 */
const chainHex = (id: number) => `0x${id.toString(16)}`;

const promptListeners = new Set<() => void>();

const changeListeners = new Set<() => void>();

/**
 * subscribeDappChange - Watches for the wallet being changed by a site rather than by its owner.
 *
 * `wallet_switchEthereumChain` and `wallet_addEthereumChain` move the active network, and the network
 * is dashboard state — so the dashboard has to be told, or the header would go on naming the chain the
 * wallet was on before the dApp asked and every balance under it would be read against the new one.
 *
 * Only these two paths announce. The dashboard's own network picker already knows what it did, and
 * having it hear its own change back would be a second render for no new information.
 * @param {() => void} listener Called after the router changed something the dashboard owns.
 * @returns {() => void} Unsubscribes the listener.
 */
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

/**
 * The dialogs waiting to be answered, oldest first.
 *
 * A queue and not a single slot, because two tabs can ask at once and a page is perfectly entitled to
 * fire a signature request while an earlier one is still up. Only the head is ever shown; the rest
 * wait, which is also what stops a page from burying the wallet under dialogs.
 */
let prompts: DappPrompt[] = [];

/** What each pending dialog is blocking on, keyed by prompt id. */
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

/**
 * getDappPrompt - The dialog that should currently be on screen, if any.
 * @returns {DappPrompt | undefined} The head of the queue.
 */
export const getDappPrompt = () => prompts[0];

/**
 * useDappPrompt - The pending dialog, as a hook.
 *
 * The same shape as `useVault` beside it: a module singleton the dashboard subscribes to, so the
 * approval sheet can be mounted next to the other dialogs instead of inside the browser tab — a sheet
 * rendered inside that tab would be painted underneath the browser's own view, which is an OS surface
 * laid over the layout.
 * @returns {DappPrompt | undefined} The prompt to show, or `undefined` when there is nothing to ask.
 */
export const useDappPrompt = () => useSyncExternalStore(subscribePrompts, getDappPrompt, getDappPrompt);

/**
 * settle - Removes a prompt from the queue and releases whatever was waiting on it.
 * @param {string} id The prompt id.
 * @param {boolean} approved What the user decided.
 * @returns {void}
 */
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

/**
 * resolveDappPrompt - Answers the dialog on screen.
 * @param {string} id The prompt being answered.
 * @param {boolean} approved True when the user approved it.
 * @returns {void}
 */
export const resolveDappPrompt = (id: string, approved: boolean) => {
    settle(id, approved);
};

/**
 * rejectDappPrompts - Refuses everything still waiting.
 *
 * Called when the wallet locks or the browser tab is torn down. A pending dialog whose window has gone
 * would otherwise leave the page waiting on a promise that can never settle, and a dApp in that state
 * shows a spinner for good.
 * @returns {void}
 */
export const rejectDappPrompts = () => {
    for (const id of [...waiting.keys()]) {
        settle(id, false);
    }
};

/**
 * ask - Puts a dialog up and waits for the answer.
 * @param {Omit<DappPrompt, 'id'>} detail Everything but the identity, which is minted here.
 * @returns {Promise<boolean>} Whether the user approved.
 */
const ask = async (detail: Omit<DappPrompt, 'id'>) =>
    new Promise<boolean>((resolve) => {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

        waiting.set(id, resolve);

        prompts = [...prompts, { ...detail, id }];

        announcePrompts();
    });

/**
 * approve - Asks, and turns a refusal into the rejection EIP-1193 defines for it.
 *
 * Every dApp library special-cases 4001 so that closing a dialog reads as a decision rather than a
 * fault, which is why nothing here is allowed to reject with anything else.
 * @param {Omit<DappPrompt, 'id'>} detail The dialog to show.
 * @returns {Promise<void>} Resolves when approved, rejects with 4001 when not.
 */
const approve = async (detail: Omit<DappPrompt, 'id'>) => {
    const allowed = await ask(detail);

    if (!allowed) {
        throw failure(dappError.rejected, 'The user rejected the request');
    }
};

/**
 * rpc - One JSON-RPC call against the active network, over every endpoint it lists.
 *
 * Made through the native HTTP client rather than the webview's `fetch`, for the reason
 * [request.ts](request.ts) gives: there is no origin and no preflight there, so a node that answers
 * without a usable CORS header still works. It matters more here than anywhere else in the app,
 * because the endpoint can be one the user typed for a custom network.
 *
 * The two ways a call can fail are kept apart on purpose. An endpoint that does not answer is a
 * transport problem and the next endpoint is tried, which is the same failover the balance reads get.
 * An endpoint that answers with a JSON-RPC error has spoken for the chain — a reverted `eth_call` is
 * the usual one — and that answer is final: retrying it elsewhere would turn one honest revert into a
 * scan of every endpoint before returning the same thing.
 * @param {string} method The JSON-RPC method.
 * @param {unknown[]} params Its parameters, as the page sent them.
 * @returns {Promise<unknown>} Whatever the node returned.
 */
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

/**
 * signerFor - Builds a signer for the active account, connected to the active network.
 *
 * The vault is read at the moment of signing rather than held, so a wallet locked while a dialog was
 * open cannot sign when the dialog is finally answered.
 * @returns {ethers.Wallet} The signer.
 */
const signerFor = () => {
    const vault = getVault();

    if (vault === undefined) {
        throw failure(dappError.unauthorized, 'The wallet is locked');
    }

    return new ethers.Wallet(vaultManager(vault, activeAccount).retrieve().Private, getProvider());
};

/**
 * requireGrant - Refuses a method that needs a connected site.
 * @param {string} origin The calling origin.
 * @returns {void}
 */
const requireGrant = (origin: string) => {
    if (!isConnected(origin)) {
        throw failure(dappError.unauthorized, 'Connect to Nura Wallet before calling this method');
    }

    if (activeAddress.length === 0) {
        throw failure(dappError.unauthorized, 'The wallet is locked');
    }
};

/**
 * The one permission this wallet issues, in EIP-2255's shape.
 *
 * `eth_accounts` is the only capability there is to grant here: everything else a page can do either
 * needs no permission or is gated on its own dialog every single time, which is a stronger rule than
 * a stored permission and is why none of them are listed.
 * @returns {object[]} The permission list for a connected site.
 */
const permissions = () => [{ parentCapability: 'eth_accounts', invoker: '', caveats: [{ type: 'restrictReturnedAccounts', value: [activeAddress] }] }];

/**
 * readAddress - Pulls an address out of a parameter, or refuses.
 * @param {unknown} value The parameter.
 * @returns {string} The checksummed address.
 */
const readAddress = (value: unknown) => {
    if (typeof value !== 'string' || !ethers.isAddress(value)) {
        throw failure(dappError.invalidParams, 'Expected an address');
    }

    return ethers.getAddress(value);
};

/**
 * matchesAccount - Whether an address the page named is the one the wallet would sign with.
 * @param {unknown} value The address the page asked to sign with.
 * @returns {boolean} True when it is the active account.
 */
const matchesAccount = (value: unknown) => typeof value === 'string' && ethers.isAddress(value) && ethers.getAddress(value) === activeAddress;

/**
 * readable - Turns a signable payload into something worth showing a person.
 *
 * `personal_sign` carries hex-encoded bytes, and the overwhelming majority of them are UTF-8 text — a
 * sign-in message, a terms acceptance, a nonce with a sentence around it. Showing the hex would make
 * every one of those unreadable, and a prompt nobody can read is a prompt everybody approves. Anything
 * that does not decode is shown as the hex it is, which is the honest answer for a payload that really
 * is opaque.
 * @param {string} value The parameter as the page sent it.
 * @returns {string} Text to show in the dialog.
 */
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

/**
 * signBytes - The bytes `personal_sign` is actually asked to sign.
 *
 * A hex string is bytes and is signed as bytes; anything else is signed as UTF-8 text. Signing a hex
 * string as text instead would produce a valid signature over the wrong message, which no dApp would
 * be able to verify and no user could have noticed.
 * @param {string} value The parameter as the page sent it.
 * @returns {Uint8Array | string} What to hand the signer.
 */
const signBytes = (value: string) => (ethers.isHexString(value) ? ethers.getBytes(value) : value);

/**
 * typedPayload - Reads and checks an EIP-712 payload.
 *
 * The chain is checked because the domain separator is what binds a signature to one network: a
 * signature collected here for another chain's domain is a signature that can be replayed there, and
 * the user reading the dialog has no way to see the difference. `EIP712Domain` is dropped from the
 * type list because ethers derives it from the domain itself and rejects the payload when it is also
 * declared.
 * @param {unknown} value The second parameter, a JSON string or an already-parsed object.
 * @returns {{ domain: ethers.TypedDataDomain; types: Record<string, ethers.TypedDataField[]>; message: Record<string, unknown> }} The payload, ready to sign.
 */
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

/**
 * transactionRequest - Turns the object a page sent into one ethers will broadcast.
 *
 * `from` is checked rather than used: the signer is the wallet's active account and nothing a page
 * says can change that, so a page naming a different account is asking for something this wallet
 * cannot do and is told so rather than being quietly given a signature from the wrong key.
 * @param {unknown} value The first parameter of `eth_sendTransaction`.
 * @returns {ethers.TransactionRequest} The request to sign.
 */
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

    // An absent `to` is a contract deployment, and libraries spell "absent" three different ways —
    // missing, null, or the empty string. Passing the empty string to the address check would refuse a
    // perfectly valid deployment as a malformed address.
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

    // `gas` is what the JSON-RPC method is spelled with and `gasLimit` is what ethers wants, so the
    // rename happens here rather than being left to surface as a transaction with no limit at all.
    const gas = quantity('gas') ?? quantity('gasLimit');

    if (gas !== undefined) {
        request.gasLimit = gas;
    }

    const nonce = quantity('nonce');

    if (nonce !== undefined) {
        request.nonce = Number(nonce);
    }

    // A page that named a legacy price and a page that named EIP-1559 caps are asking for different
    // transaction types, and passing both through would let ethers build something that is neither.
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

/**
 * estimateFee - What the transaction is likely to cost, for the dialog to show.
 *
 * Best effort by design. A transaction that cannot be estimated is usually one that would revert, and
 * that is worth telling the user rather than refusing outright — the estimate is a courtesy on the
 * dialog and the send itself is what decides. An empty string means "no figure", and the sheet leaves
 * the row out.
 * @param {ethers.TransactionRequest} request The transaction being reviewed.
 * @returns {Promise<string>} The fee, formatted in the network's symbol, or an empty string.
 */
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

/**
 * privateAddress - Whether a host names something inside the device or its network.
 *
 * The check that stops `wallet_addEthereumChain` being a way to reach the machine the wallet runs on.
 * An endpoint a site supplies is fetched by the *native* HTTP client, which has no origin, sends no
 * preflight and is scoped to every address on the internet — so a site naming `127.0.0.1:8545` or
 * `169.254.169.254` would be pointing that client at things the browser sandbox exists to keep it away
 * from: a local node, a router admin page, a cloud metadata service.
 *
 * **This reads the literal host and nothing else.** A name that resolves to a private address passes,
 * because resolving it is not something a webview can do — there is no DNS API here, and re-checking
 * after a redirect would mean owning the transport. It raises the cost of the obvious attack rather
 * than closing the class, and the `https` requirement beside it is what carries the rest: a rebinding
 * attack has to survive a TLS handshake against a name it does not hold a certificate for.
 * @param {string} host The hostname as `URL` reports it, IPv6 still bracketed.
 * @returns {boolean} True when the host must not be reachable from a site's request.
 */
const privateAddress = (host: string) => {
    const name = host.replaceAll(/^\[|\]$/gu, '').toLowerCase();

    if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local') || name.endsWith('.internal') || name.endsWith('.home.arpa')) {
        return true;
    }

    if (name.includes(':')) {
        // Loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10), and every
        // IPv4-mapped form — the last of these outright, since it is only ever a way of spelling an
        // address the rules below already answer.
        return name === '::' || name === '::1' || /^f[cd]/u.test(name) || /^fe[89ab]/u.test(name) || name.startsWith('::ffff:');
    }

    const octets = name.split('.').map(Number);

    // Not four numbers, so not an IPv4 literal — a DNS name, which the paragraph above explains is
    // not something that can be judged from here.
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

/**
 * siteSuppliedUrl - Whether an address a website handed over is one the wallet will talk to.
 *
 * `https` only, and no private hosts. Both are stricter than what the wallet accepts from its own
 * network form, deliberately: a URL typed into that form is the user choosing an endpoint, and a
 * developer pointing the wallet at `http://localhost:8545` is doing something reasonable. A URL that
 * arrived inside a page's request is the *site* choosing an endpoint the wallet will then read
 * balances from, estimate gas against and broadcast transactions to — and plaintext there means
 * anything on the path can rewrite those answers.
 * @param {string} url The candidate address.
 * @returns {boolean} True when it may be stored.
 */
const siteSuppliedUrl = (url: string) => {
    try {
        const parsed = new URL(url);

        return parsed.protocol === 'https:' && !privateAddress(parsed.hostname);
    } catch {
        return false;
    }
};

/**
 * networkFrom - Reads the network a page is asking to be added.
 *
 * Only the fields the wallet actually stores are taken, and every address in them has to pass
 * `siteSuppliedUrl`. That check is the substance of this function: adding a chain makes it the
 * *active* one, and the active network's endpoints are what the balance reads, the token reads, the
 * history lookups, the gas estimates and the transaction broadcasts all go to. A site that chooses
 * that endpoint chooses what the wallet believes about the chain and sees every address it asks
 * about — which is why the endpoint is also put in front of the user rather than left implied by a
 * chain name they have no way to check it against.
 * @param {unknown} value The first parameter of `wallet_addEthereumChain`.
 * @returns {{ network: Parameters<typeof addNetwork>[0]; id: number }} The network to store.
 */
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

    // Held to the same rule as the RPC list, which is not obvious until you follow where it goes: the
    // explorer address becomes the base for the history and token-discovery lookups in
    // [history.ts](../hook/history.ts) and [token.ts](token.ts), and those are made by the same native
    // client. An explorer nobody checked is the same reachability problem as an RPC nobody checked.
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

/**
 * broadcast - Tells every page that should hear it what the wallet is now showing.
 *
 * The audience is chosen per event and that is the whole point of this function. `chainChanged` names
 * a public fact and goes to every page holding a provider, so a site that has not connected still
 * renders the right network. `accountsChanged` carries the address, so it goes only to sites the user
 * connected — sending it to the rest would hand the account to every site the browser has open.
 * @returns {void}
 */
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
 * syncDappState - Re-announces the wallet after the user changed something in it.
 *
 * Called by the dashboard whenever the active account or network moves. It is safe to call when
 * nothing changed: `broadcast` compares against what the pages were last told and stays quiet.
 * @returns {void}
 */
export const syncDappState = () => {
    broadcast();
};

/**
 * disconnectDapp - Withdraws a site's grant and tells its open pages.
 *
 * The empty account list is not a courtesy — it is how EIP-1193 spells "you are no longer connected",
 * and a dApp that handles it puts itself back into its signed-out state without a reload.
 * @param {string} origin The origin to disconnect.
 * @returns {Promise<void>} Resolves once the grant is gone and the pages have been told.
 */
export const disconnectDapp = async (origin: string) => {
    await revokeConnection(origin);

    for (const page of getDappPages()) {
        if (page.origin === origin) {
            emitDappEvent(page.label, 'accountsChanged', []);
        }
    }
};

/**
 * disconnectAllDapps - Withdraws every grant the wallet holds.
 *
 * The counterpart to clearing the visited list, and offered next to it: which sites a wallet is
 * connected to is a record of where its owner has been, and a user asking the browser to forget that
 * means all of it.
 *
 * One write rather than one per origin. Revoking them individually would mean several reads and
 * writes of the same stored list racing each other, and a run that failed halfway would leave the
 * wallet connected to some of the sites the user just asked it to forget.
 * @returns {Promise<void>} Resolves once the grants are gone and the open pages have been told.
 */
export const disconnectAllDapps = async () => {
    const dropped = new Set(getConnections());

    await clearConnections();

    for (const page of getDappPages()) {
        if (dropped.has(page.origin)) {
            emitDappEvent(page.label, 'accountsChanged', []);
        }
    }
};

/**
 * route - Answers one call, or throws the rejection the page should see.
 *
 * Ordered by what a method needs rather than alphabetically: the ones that need nothing, then the one
 * that asks for the grant, then the ones that need it, then the chain and asset requests, and finally
 * the read proxy that everything unrecognised falls past into.
 * @param {DappEnvelope} envelope The call, with its origin already established.
 * @returns {Promise<unknown>} The result to send back.
 */
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

        // An unconnected page is told nothing rather than told off: EIP-1193 has this answer with an
        // empty list, and every dApp reads that as "not connected yet" and offers its connect button.
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

                // The page asked, so it is entitled to the answer immediately — but every *other*
                // page on the same origin is now connected too and has heard nothing.
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

            // The spec puts the message first and the address second, and a good number of dApps send
            // them the other way round. Whichever parameter is an address is the address.
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

        // Signs a 32-byte digest with no context and no way for the user to know what it commits them
        // to, which is why every major wallet has removed it. A dApp that still calls it has a
        // `personal_sign` or an EIP-712 path beside it, and this is what sends it down one of those.
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

            if (id === getNetwork().chainId) {
                return null;
            }

            const found = getNetworks().find((item) => item.chainId === id);

            // 4902 is the whole reason EIP-3326 has its own code: it is what tells a dApp it may
            // follow up with `wallet_addEthereumChain` rather than give up.
            if (found === undefined) {
                throw failure(dappError.chainMissing, 'Nura Wallet does not know this chain', { chainId: target.chainId });
            }

            await approve({ kind: 'chain', origin, summary: found.name, chain: { name: found.name, id, rpc: found.rpcUrl } });

            await setNetwork(found.id);

            broadcast();

            announceChange();

            return null;
        }

        case 'wallet_addEthereumChain': {
            const { network, id } = networkFrom(params[0]);

            const known = getNetworks().find((item) => item.chainId === id);

            if (known !== undefined) {
                if (id !== getNetwork().chainId) {
                    await approve({ kind: 'chain', origin, summary: known.name, chain: { name: known.name, id, rpc: known.rpcUrl } });

                    await setNetwork(known.id);

                    broadcast();

                    announceChange();
                }

                return null;
            }

            await approve({ kind: 'chain', origin, summary: network.name, chain: { name: network.name, id, rpc: network.rpcUrl } });

            // Adding activates it, which is what the method is for: a dApp asks for a chain it needs
            // and then expects to be on it.
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

            // The token's real name and decimals are read off the contract by the dashboard rather
            // than taken from here, because everything in `options` was written by the site.
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

/**
 * describe - Turns anything thrown along the way into a rejection a page can read.
 *
 * ethers puts its own `code` on the errors it throws — `ACTION_REJECTED`, `INSUFFICIENT_FUNDS` and the
 * rest — which is a string where EIP-1193 requires a number, so those are translated rather than
 * passed on. A page receiving a string code sees `undefined` when it compares against 4001.
 * @param {unknown} cause The caught value.
 * @returns {DappFailure} What to send back.
 */
const describe = (cause: unknown): DappFailure => {
    if (cause instanceof DappError) {
        return { code: cause.code, message: cause.message, ...(cause.data === undefined ? {} : { data: cause.data }) };
    }

    if (cause instanceof Error) {
        return { code: dappError.internal, message: cause.message };
    }

    return { code: dappError.internal, message: String(cause) };
};

/**
 * answerDapp - The single entry point the bridge hands every call to.
 *
 * Nothing here rejects: a provider that throws instead of replying leaves the page's promise pending
 * for good, and a dApp waiting on a request that never settles simply stops working with nothing on
 * screen to say why.
 * @param {DappEnvelope} envelope The call, with the origin the native side stamped on it.
 * @returns {Promise<DappReply>} The reply to deliver.
 */
export const answerDapp = async (envelope: DappEnvelope): Promise<DappReply> => {
    try {
        const result = await route(envelope);

        return { id: envelope.id, result };
    } catch (cause) {
        return { id: envelope.id, error: describe(cause) };
    }
};
