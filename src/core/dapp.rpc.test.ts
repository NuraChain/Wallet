import { ethers } from 'ethers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DappEnvelope } from './dapp';

/**
 * The router as a dApp meets it: every request that reaches the wallet — from a page in the
 * browser, from a deep link — is answered here, so this is where the chain id, the account, the
 * approvals and the refusals are pinned down.
 *
 * The Tauri plugins are stood in for: the store keeps values in memory and the HTTP client answers
 * the one read method the tests proxy, so nothing here touches disk or the network.
 */

const held = new Map<string, string>();

vi.mock('@tauri-apps/plugin-store', () => ({
    load: async () => ({
        get: async (key: string) => held.get(key),
        set: async (key: string, value: string) => {
            held.set(key, value);
        },
        delete: async (key: string) => {
            held.delete(key);
        },
        save: async () => undefined
    })
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => undefined }));

vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => undefined }));

const rpcCalls: { url: string; body: unknown }[] = [];

vi.mock('@tauri-apps/plugin-http', () => ({
    fetch: async (url: string, init?: { body?: string }) => {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const body = JSON.parse(init?.body ?? '{}') as { method: string; id: number };

        rpcCalls.push({ url, body });

        return { ok: true, json: async () => ({ jsonrpc: '2.0', id: body.id, result: '0x10f2c' }) };
    }
}));

const { clearConnections, grantConnection } = await import('./dapp');
const { getNetwork, setNetwork } = await import('./network');
const { lockSession, unlockSession } = await import('./session');

const { answerDapp, getDappAccount, getDappPrompt, rejectDappPrompts, resolveDappPrompt, setDappAccount } = await import('./dapp.rpc');

const wallet = ethers.Wallet.createRandom();

const origin = 'https://dapp.example';

const stranger = '0x000000000000000000000000000000000000dEaD';

const call = (method: string, params: unknown[] = [], extra: Partial<DappEnvelope> = {}): DappEnvelope => ({
    id: 'test-1',
    label: 'nura-browser-1',
    origin,
    method,
    params,
    ...extra
});

/** Waits for the prompt a request raises, answers it the way a person would, and hands it back. */
const settle = async (approved: boolean) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const prompt = getDappPrompt();

        if (prompt !== undefined) {
            resolveDappPrompt(prompt.id, approved);

            return prompt;
        }

        // oxlint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
            setTimeout(resolve, 1);
        });
    }

    throw new Error('no prompt was raised');
};

const asked = async (envelope: DappEnvelope, approved: boolean) => {
    const answer = answerDapp(envelope);

    const prompt = await settle(approved);

    return { reply: await answer, prompt };
};

beforeAll(() => {
    unlockSession({ kind: 'privateKey', secret: wallet.privateKey });

    setDappAccount(wallet.address, 0);
});

beforeEach(async () => {
    await clearConnections();

    rpcCalls.length = 0;
});

afterEach(() => {
    rejectDappPrompts();
});

describe('what the wallet answers without being asked twice', () => {
    it('reports Nura Chain as 0x3fc and 1020', async () => {
        expect(getNetwork().chainId).toBe(1020);

        await expect(answerDapp(call('eth_chainId'))).resolves.toEqual({ id: 'test-1', result: '0x3fc' });
        await expect(answerDapp(call('net_version'))).resolves.toEqual({ id: 'test-1', result: '1020' });
    });

    it('names itself', async () => {
        const reply = await answerDapp(call('web3_clientVersion'));

        expect(String(reply.result)).toMatch(/^NuraWallet\//u);
    });

    it('shows no account to a site that has not been granted one', async () => {
        await expect(answerDapp(call('eth_accounts'))).resolves.toEqual({ id: 'test-1', result: [] });
        await expect(answerDapp(call('eth_coinbase'))).resolves.toEqual({ id: 'test-1', result: null });
        await expect(answerDapp(call('wallet_getPermissions'))).resolves.toEqual({ id: 'test-1', result: [] });
    });

    it('serves nothing at all to a caller with no origin', async () => {
        const reply = await answerDapp(call('eth_chainId', [], { origin: '' }));

        expect(reply.error?.code).toBe(4100);
    });
});

describe('connecting', () => {
    it('asks before it hands over the account, and remembers the answer', async () => {
        const { reply, prompt } = await asked(call('eth_requestAccounts'), true);

        expect(prompt.kind).toBe('connect');
        expect(prompt.origin).toBe(origin);

        expect(reply.result).toEqual([wallet.address]);

        // The grant is what a later call reads: a second request answers straight away.
        await expect(answerDapp(call('eth_accounts'))).resolves.toEqual({ id: 'test-1', result: [wallet.address] });

        const permissions = await answerDapp(call('wallet_getPermissions'));

        expect(JSON.stringify(permissions.result)).toContain(wallet.address);
    });

    it('reports a refusal as 4001 and grants nothing', async () => {
        const { reply } = await asked(call('eth_requestAccounts'), false);

        expect(reply.error?.code).toBe(4001);

        await expect(answerDapp(call('eth_accounts'))).resolves.toEqual({ id: 'test-1', result: [] });
    });

    it('hands back the permission list when a dApp asks in the other dialect', async () => {
        const { reply } = await asked(call('wallet_requestPermissions', [{ eth_accounts: {} }]), true);

        expect(JSON.stringify(reply.result)).toContain('eth_accounts');
    });

    it('lets a site go again', async () => {
        await asked(call('eth_requestAccounts'), true);

        await answerDapp(call('wallet_revokePermissions', [{ eth_accounts: {} }]));

        await expect(answerDapp(call('eth_accounts'))).resolves.toEqual({ id: 'test-1', result: [] });
    });

    it('refuses everything while the wallet is locked', async () => {
        await grantConnection(origin);

        setDappAccount('', 0);
        lockSession();

        const reply = await answerDapp(call('eth_requestAccounts'));

        expect(reply.error?.code).toBe(4100);

        unlockSession({ kind: 'privateKey', secret: wallet.privateKey });
        setDappAccount(wallet.address, 0);

        expect(getDappAccount()).toBe(wallet.address);
    });
});

describe('signing', () => {
    it('will not sign for a site that never connected', async () => {
        const reply = await answerDapp(call('personal_sign', ['0x68690a', wallet.address]));

        expect(reply.error?.code).toBe(4100);
    });

    it('signs a message once the person approves, and the signature is the account’s own', async () => {
        await grantConnection(origin);

        const message = 'Sign in to dapp.example';

        const payload = ethers.hexlify(ethers.toUtf8Bytes(message));

        const { reply, prompt } = await asked(call('personal_sign', [payload, wallet.address]), true);

        expect(prompt.kind).toBe('signature');
        expect(prompt.summary).toBe(message);

        expect(ethers.verifyMessage(message, String(reply.result))).toBe(wallet.address);
    });

    it('accepts the arguments in the order the older dApps send them', async () => {
        await grantConnection(origin);

        const message = 'hello';

        const payload = ethers.hexlify(ethers.toUtf8Bytes(message));

        const { reply } = await asked(call('personal_sign', [wallet.address, payload]), true);

        expect(ethers.verifyMessage(message, String(reply.result))).toBe(wallet.address);
    });

    it('refuses to sign as somebody else', async () => {
        await grantConnection(origin);

        const reply = await answerDapp(call('personal_sign', ['0x68690a', stranger]));

        expect(reply.error?.code).toBe(4100);
    });

    it('refuses a rejected signature with 4001', async () => {
        await grantConnection(origin);

        const { reply } = await asked(call('personal_sign', ['0x68690a', wallet.address]), false);

        expect(reply.error?.code).toBe(4001);
    });

    it('signs typed data', async () => {
        await grantConnection(origin);

        const domain = { name: 'Nura', version: '1', chainId: 1020, verifyingContract: stranger };

        const types = { Order: [{ name: 'amount', type: 'uint256' }] };

        const message = { amount: '1' };

        const payload = JSON.stringify({ domain, types: { ...types, EIP712Domain: [] }, message, primaryType: 'Order' });

        const { reply } = await asked(call('eth_signTypedData_v4', [wallet.address, payload]), true);

        expect(ethers.verifyTypedData(domain, types, message, String(reply.result))).toBe(wallet.address);
    });

    it('turns down typed data meant for another chain', async () => {
        await grantConnection(origin);

        const payload = JSON.stringify({ domain: { chainId: 56 }, types: {}, message: {} });

        const reply = await answerDapp(call('eth_signTypedData_v4', [wallet.address, payload]));

        expect(reply.error?.code).toBe(-32000);
    });

    it('turns eth_sign down, and says what to use instead', async () => {
        await grantConnection(origin);

        const reply = await answerDapp(call('eth_sign', [wallet.address, '0x68690a']));

        expect(reply.error?.code).toBe(4200);
        expect(reply.error?.message).toContain('personal_sign');
    });

    it('will not send a transaction from an account it does not hold', async () => {
        await grantConnection(origin);

        const reply = await answerDapp(call('eth_sendTransaction', [{ from: stranger, to: stranger, value: '0x1' }]));

        expect(reply.error?.code).toBe(4100);
    });
});

describe('networks', () => {
    it('turns down a chain it has never heard of, the way EIP-3326 asks', async () => {
        const reply = await answerDapp(call('wallet_switchEthereumChain', [{ chainId: '0xa4b1' }]));

        expect(reply.error?.code).toBe(4902);
        expect(reply.error?.data).toEqual({ chainId: '0xa4b1' });
    });

    it('asks before it moves the wallet, and moves it', async () => {
        const { reply, prompt } = await asked(call('wallet_switchEthereumChain', [{ chainId: '0x38' }]), true);

        expect(prompt.kind).toBe('chain');
        expect(prompt.chain?.id).toBe(56);

        expect(reply.error).toBeUndefined();
        expect(getNetwork().chainId).toBe(56);

        await expect(answerDapp(call('eth_chainId'))).resolves.toEqual({ id: 'test-1', result: '0x38' });

        await setNetwork('nura');

        expect(getNetwork().chainId).toBe(1020);
    });

    it('stays where it is when the person says no', async () => {
        const { reply } = await asked(call('wallet_switchEthereumChain', [{ chainId: '0x38' }]), false);

        expect(reply.error?.code).toBe(4001);
        expect(getNetwork().chainId).toBe(1020);
    });

    it('will not add a chain that offers no https endpoint', async () => {
        const reply = await answerDapp(call('wallet_addEthereumChain', [{ chainId: '0x2329', chainName: 'Local', rpcUrls: ['http://127.0.0.1:8545'] }]));

        expect(reply.error?.code).toBe(-32602);
    });
});

describe('reads and everything else', () => {
    it('proxies a read to the network the wallet is on', async () => {
        const reply = await answerDapp(call('eth_blockNumber', []));

        expect(reply.result).toBe('0x10f2c');
        expect(rpcCalls[0].url).toBe(getNetwork().rpcUrl);
        expect(rpcCalls[0].body).toMatchObject({ method: 'eth_blockNumber' });
    });

    it('says plainly what it does not support', async () => {
        const reply = await answerDapp(call('eth_getFilterChanges', []));

        expect(reply.error?.code).toBe(4200);
    });
});
