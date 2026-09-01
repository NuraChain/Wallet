import type { IWalletKit, WalletKitTypes } from '@reown/walletkit';

import { useSyncExternalStore } from 'react';

import { siteOrigin } from './dapp';
import { dappLog } from './dapp.log';
import { getValue, setValue } from '../utility/storage';
import { getNetwork, getNetworks } from './network';
import { readWalletConnectUri } from './walletconnect.uri';
import { accountKey, approveNamespaces, chainKey, namespaceKey, readChainKey, sessionAccounts } from './walletconnect.session';
import { answerDapp, askDappPrompt, ensureDappChain, getDappAccount, onDappBroadcast, setDappWalletConnect, type DappMove } from './dapp.rpc';

/**
 * The wallet half of WalletConnect: it pairs on a `wc:` URI, shows the proposal for approval, and
 * then feeds every session request through the same router the in-app browser uses, so a request
 * that arrives over a relay is approved, signed and refused exactly like one from a page.
 *
 * The SDK is loaded on demand. It is a large dependency and most runs of the wallet never need it,
 * so nothing is imported until a pairing arrives or a session from an earlier run is waiting.
 */

export type WalletConnectState = 'off' | 'idle' | 'linking' | 'ready' | 'failed';

export interface WalletConnectSession {
    topic: string;
    name: string;
    url: string;
    icon: string;
    chains: number[];
}

type SdkReason = 'USER_REJECTED' | 'USER_DISCONNECTED' | 'UNSUPPORTED_CHAINS' | 'UNSUPPORTED_METHODS';

const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '').trim();

const metadata = {
    name: 'Nura Wallet',
    description: 'Nura Wallet — the wallet for Nura Chain and every EVM network you add.',
    url: 'https://nurachain.net',
    icons: [__APP_ICON__],

    // Where a dApp on the same phone should send the person back to once they have answered.
    redirect: { native: 'nurawallet://' }
};

let kit: IWalletKit | undefined;
let booting: Promise<IWalletKit> | undefined;
let reasons: ((key: SdkReason) => { code: number; message: string }) | undefined;

let state: WalletConnectState = projectId.length === 0 ? 'off' : 'idle';
let sessions: WalletConnectSession[] = [];
let running = false;

const paired = new Set<string>();

const listeners = new Set<() => void>();

const announce = () => {
    for (const listener of listeners) {
        listener();
    }
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

export const walletConnectConfigured = () => projectId.length > 0;

export const getWalletConnectState = () => state;

export const getWalletConnectSessions = () => sessions;

export const useWalletConnectSessions = () => useSyncExternalStore(subscribe, getWalletConnectSessions, getWalletConnectSessions);

const setState = (next: WalletConnectState) => {
    state = next;

    announce();
};

const sdkReason = (key: SdkReason) => reasons?.(key) ?? { code: 5000, message: key };

/**
 * A session is known by the dApp that proposed it. The origin is what the wallet shows and what
 * the router stamps on every request, so a metadata URL that is not a real web origin falls back
 * to something a person can still recognise rather than to an empty string.
 */
const originOf = (peer: { url?: string; name?: string }) => {
    const url = peer.url ?? '';

    return siteOrigin(url) || url.trim() || peer.name?.trim() || 'WalletConnect';
};

const readSessions = (client: IWalletKit): WalletConnectSession[] =>
    Object.values(client.getActiveSessions()).map((session) => ({
        topic: session.topic,
        name: session.peer.metadata.name,
        url: session.peer.metadata.url,
        icon: session.peer.metadata.icons[0] ?? '',
        chains: (session.namespaces[namespaceKey]?.chains ?? []).map((key) => readChainKey(key)).filter((id): id is number => id !== undefined)
    }));

const refresh = () => {
    if (kit === undefined) {
        return;
    }

    sessions = readSessions(kit);

    announce();
};

// Sessions outlive the run that made them, so the next start has to bring the relay back up on its
// own. The flag says whether that is worth doing, which keeps a wallet that has never paired from
// loading the SDK or opening a socket at all.
const remember = async (held: boolean) => {
    await setValue('Browser.WalletConnect', held ? '1' : '').catch(() => undefined);
};

const reply = (id: number, result: unknown) => ({ id, jsonrpc: '2.0' as const, result });

const refuse = (id: number, code: number, message: string) => ({ id, jsonrpc: '2.0' as const, error: { code, message } });

const onProposal = async (event: WalletKitTypes.SessionProposal) => {
    const client = kit;

    if (client === undefined) {
        return;
    }

    const { id, params } = event;

    const peer = params.proposer.metadata;
    const origin = originOf(peer);

    dappLog('WalletConnect', 'session proposal', { id, origin, name: peer.name });

    const address = getDappAccount();

    // A wallet that is locked, or one that has stopped answering, refuses rather than leaving the
    // dApp on a spinner until the proposal expires.
    if (!running || address.length === 0) {
        await client.rejectSession({ id, reason: sdkReason('USER_REJECTED') }).catch(() => undefined);

        return;
    }

    const answer = approveNamespaces({
        required: params.requiredNamespaces,
        optional: params.optionalNamespaces,
        known: getNetworks().map((item) => item.chainId),
        active: getNetwork().chainId,
        address
    });

    if (answer.namespaces === undefined) {
        dappLog('WalletConnect', 'proposal asks for chains the wallet has not got', { id, missing: answer.missing.join(', ') });

        await client.rejectSession({ id, reason: sdkReason('UNSUPPORTED_CHAINS') }).catch(() => undefined);

        return;
    }

    const allowed = await askDappPrompt({ kind: 'connect', origin, name: peer.name, summary: origin });

    if (!allowed) {
        dappLog('WalletConnect', 'proposal rejected', { id, origin });

        await client.rejectSession({ id, reason: sdkReason('USER_REJECTED') }).catch(() => undefined);

        return;
    }

    try {
        await client.approveSession({ id, namespaces: answer.namespaces });

        await remember(true);

        dappLog('WalletConnect', 'session approved', { id, origin });
    } catch (cause) {
        dappLog('WalletConnect', 'session could not be approved', { id, message: cause instanceof Error ? cause.message : String(cause) });

        // The dApp is waiting on an answer either way, and a refusal it can read beats a proposal
        // that sits there until it expires.
        await client.rejectSession({ id, reason: sdkReason('USER_REJECTED') }).catch(() => undefined);
    }

    refresh();
};

const onRequest = async (event: WalletKitTypes.SessionRequest) => {
    const client = kit;

    if (client === undefined) {
        return;
    }

    const { id, topic, params } = event;

    const { request, chainId } = params;

    const session = client.getActiveSessions()[topic];

    if (session === undefined) {
        return;
    }

    const origin = originOf(session.peer.metadata);

    dappLog('WalletConnect', 'session request', { id, topic, method: request.method, chain: chainId, origin });

    if (!running) {
        await client.respondSessionRequest({ topic, response: refuse(id, 4900, 'Nura Wallet is locked') }).catch(() => undefined);

        return;
    }

    const wanted = readChainKey(chainId);

    // A session may hold several chains at once; the wallet holds one. A request for another of
    // the session's chains asks the person to move the wallet, the same prompt a page would raise.
    if (wanted !== undefined && wanted !== getNetwork().chainId) {
        let moved = false;

        try {
            moved = await ensureDappChain(wanted, origin);
        } catch {
            await client.respondSessionRequest({ topic, response: refuse(id, 4001, 'The user rejected the request') }).catch(() => undefined);

            return;
        }

        if (!moved) {
            await client.respondSessionRequest({ topic, response: refuse(id, 4901, `Nura Wallet is not on ${chainId}`) }).catch(() => undefined);

            return;
        }
    }

    const answer = await answerDapp({
        id: String(id),
        label: `walletconnect:${topic}`,
        origin,
        method: request.method,
        params: Array.isArray(request.params) ? request.params : [request.params],

        // The session is the approval. It was granted once, by name, on a prompt the person read.
        granted: true
    });

    const response = answer.error === undefined ? reply(id, answer.result) : refuse(id, answer.error.code, answer.error.message);

    await client.respondSessionRequest({ topic, response }).catch(() => undefined);
};

const onDelete = async (event: { topic: string }) => {
    dappLog('WalletConnect', 'session closed by the dApp', { topic: event.topic });

    refresh();

    if (sessions.length === 0) {
        await remember(false);
    }
};

/**
 * One-click auth (EIP-4361 over WalletConnect) is answered with a refusal rather than left to time
 * out, so a dApp that offers it falls back to an ordinary session proposal instead of waiting on a
 * wallet that will never reply.
 */
const onAuthenticate = async (event: WalletKitTypes.SessionAuthenticate) => {
    dappLog('WalletConnect', 'authentication request declined', { id: event.id });

    await kit?.rejectSessionAuthenticate({ id: event.id, reason: sdkReason('UNSUPPORTED_METHODS') }).catch(() => undefined);
};

const boot = async () => {
    setState('linking');

    const [core, walletkit, utils] = await Promise.all([import('@walletconnect/core'), import('@reown/walletkit'), import('@walletconnect/utils')]);

    reasons = utils.getSdkError;

    const client = await walletkit.WalletKit.init({
        core: new core.Core({ projectId, logger: 'error' }),
        metadata
    });

    client.on('session_proposal', (event) => {
        void onProposal(event);
    });

    client.on('session_request', (event) => {
        void onRequest(event);
    });

    client.on('session_delete', (event) => {
        void onDelete(event);
    });

    client.on('session_authenticate', (event) => {
        void onAuthenticate(event);
    });

    client.on('proposal_expire', (event) => {
        dappLog('WalletConnect', 'proposal expired', { id: event.id });
    });

    client.on('session_request_expire', (event) => {
        dappLog('WalletConnect', 'request expired', { id: event.id });
    });

    kit = client;

    setState('ready');

    refresh();

    dappLog('WalletConnect', 'initialized', { sessions: sessions.length });

    return client;
};

const ensureKit = async () => {
    if (kit !== undefined) {
        return kit;
    }

    if (!walletConnectConfigured()) {
        throw new Error('WalletConnect needs a project id in this build');
    }

    booting ??= boot().catch((cause: unknown) => {
        booting = undefined;

        setState('failed');

        throw cause instanceof Error ? cause : new Error(String(cause));
    });

    return booting;
};

/**
 * Takes anything that might carry a pairing — a link a page opened, a scheme the webview refused,
 * a deep link, a line someone pasted — and pairs on the URI inside it.
 */
export const pairWalletConnect = async (raw: string) => {
    const link = readWalletConnectUri(raw);

    if (link === undefined) {
        throw new Error('That is not a WalletConnect link');
    }

    if (link.version !== 2) {
        throw new Error(`WalletConnect v${link.version} is no longer served by its relays`);
    }

    // The same pairing reaches the wallet twice whenever a page both opens the link and lets the
    // navigation through to the native layer. The second one would only fail inside the SDK.
    if (paired.has(link.topic)) {
        dappLog('WalletConnect', 'pairing already seen', { topic: link.topic });

        return;
    }

    const client = await ensureKit();

    paired.add(link.topic);

    dappLog('WalletConnect', 'pairing', { topic: link.topic });

    try {
        await client.pair({ uri: link.uri });
    } catch (cause) {
        paired.delete(link.topic);

        throw cause instanceof Error ? cause : new Error(String(cause));
    }
};

export const disconnectWalletConnect = async (topic: string) => {
    const client = kit;

    if (client === undefined) {
        return;
    }

    await client.disconnectSession({ topic, reason: sdkReason('USER_DISCONNECTED') }).catch(() => undefined);

    refresh();

    if (sessions.length === 0) {
        await remember(false);
    }
};

export const disconnectAllWalletConnect = async () => {
    // Each disconnect rewrites the list, so the loop walks the topics taken before the first one.
    const held = sessions.map((session) => session.topic);

    for (const topic of held) {
        // oxlint-disable-next-line no-await-in-loop
        await disconnectWalletConnect(topic);
    }
};

const carry = async (address: string, chainId: number, moved: DappMove) => {
    const client = kit;

    if (client === undefined || address.length === 0) {
        return;
    }

    const key = chainKey(chainId);

    for (const session of Object.values(client.getActiveSessions())) {
        const namespace = session.namespaces[namespaceKey];

        if (namespace === undefined) {
            continue;
        }

        const held = namespace.chains ?? [];

        // A session can only be told about a chain it holds, so a wallet that has moved somewhere
        // else widens the session first. The accounts follow the chains, always the one account.
        const chains = held.includes(key) ? held : [...held, key];

        const accounts = sessionAccounts({ ...namespace, chains }, address);

        if (!held.includes(key) || namespace.accounts.join(',') !== accounts.join(',')) {
            // oxlint-disable-next-line no-await-in-loop
            await client
                .updateSession({ topic: session.topic, namespaces: { ...session.namespaces, [namespaceKey]: { ...namespace, chains, accounts } } })
                .catch(() => undefined);
        }

        if (moved.chain) {
            // oxlint-disable-next-line no-await-in-loop
            await client.emitSessionEvent({ topic: session.topic, chainId: key, event: { name: 'chainChanged', data: chainId } }).catch(() => undefined);
        }

        if (moved.account) {
            // oxlint-disable-next-line no-await-in-loop
            await client
                .emitSessionEvent({ topic: session.topic, chainId: key, event: { name: 'accountsChanged', data: [accountKey(chainId, address)] } })
                .catch(() => undefined);
        }
    }

    refresh();
};

/**
 * Starts answering WalletConnect for as long as the wallet is unlocked. Nothing is loaded here
 * unless a session from an earlier run is waiting; a pairing that arrives later brings the client
 * up on its own.
 */
export const startWalletConnect = () => {
    running = true;

    setDappWalletConnect(pairWalletConnect);

    const stopSink = onDappBroadcast((address, chainId, moved) => {
        void carry(address, chainId, moved);
    });

    const restore = async () => {
        const held = await getValue('Browser.WalletConnect').catch(() => undefined);

        if (held === '1' && walletConnectConfigured()) {
            await ensureKit().catch(() => undefined);
        }
    };

    void restore();

    return () => {
        running = false;

        stopSink();
    };
};
