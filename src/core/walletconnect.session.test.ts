import { describe, expect, it } from 'vitest';

import { accountKey, approveNamespaces, chainKey, namespaceKey, readChainKey, sessionAccounts, sessionEvents, sessionMethods } from './walletconnect.session';

const address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const known = [1020, 1, 56];

describe('chain keys', () => {
    it('writes Nura Chain the way CAIP-2 asks for it', () => {
        expect(chainKey(1020)).toBe('eip155:1020');
        expect(accountKey(1020, address)).toBe(`eip155:1020:${address}`);
    });

    it('reads a chain back out of a key, and only an EVM one', () => {
        expect(readChainKey('eip155:1020')).toBe(1020);
        expect(readChainKey('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBeUndefined();
        expect(readChainKey('eip155:zero')).toBeUndefined();
    });
});

describe('approveNamespaces', () => {
    it('approves a proposal that requires Nura Chain', () => {
        const answer = approveNamespaces({
            required: { eip155: { chains: ['eip155:1020'], methods: ['eth_sendTransaction', 'personal_sign'], events: ['chainChanged'] } },
            optional: {},
            known,
            active: 1020,
            address
        });

        expect(answer.missing).toEqual([]);

        const namespace = answer.namespaces?.[namespaceKey];

        expect(namespace?.chains).toContain('eip155:1020');
        expect(namespace?.accounts).toContain(`eip155:1020:${address}`);
        expect(namespace?.methods).toEqual(expect.arrayContaining(sessionMethods));
        expect(namespace?.events).toEqual(expect.arrayContaining(sessionEvents));
    });

    it('reads the chain out of the key when a proposal names one namespace per chain', () => {
        const answer = approveNamespaces({
            required: { 'eip155:56': { methods: ['personal_sign'], events: [] } },
            optional: {},
            known,
            active: 1020,
            address
        });

        expect(answer.namespaces?.[namespaceKey].chains).toEqual(expect.arrayContaining(['eip155:56', 'eip155:1020']));
    });

    it('carries every account the approved chains need', () => {
        const answer = approveNamespaces({
            required: {},
            optional: { eip155: { chains: ['eip155:1', 'eip155:56', 'eip155:137'], methods: [], events: [] } },
            known,
            active: 1020,
            address
        });

        const namespace = answer.namespaces?.[namespaceKey];

        // 137 is not a chain this wallet holds, so it is left out rather than promised.
        // Chains come back in chain-id order, not in the order a string sort would put them.
        expect(namespace?.chains).toEqual(['eip155:1', 'eip155:56', 'eip155:1020']);
        expect(namespace?.accounts).toHaveLength(namespace?.chains.length ?? 0);
        expect(namespace?.accounts.every((account) => account.endsWith(address))).toBe(true);
    });

    it('keeps a required method the wallet does not serve, so the session still forms', () => {
        const answer = approveNamespaces({
            required: { eip155: { chains: ['eip155:1020'], methods: ['eth_sign'], events: [] } },
            optional: {},
            known,
            active: 1020,
            address
        });

        // The router still refuses eth_sign; a session that never forms would refuse everything.
        expect(answer.namespaces?.[namespaceKey].methods).toContain('eth_sign');
    });

    it('refuses a proposal that requires a chain the wallet has never heard of', () => {
        const answer = approveNamespaces({
            required: { eip155: { chains: ['eip155:1020', 'eip155:42161'], methods: [], events: [] } },
            optional: {},
            known,
            active: 1020,
            address
        });

        expect(answer.namespaces).toBeUndefined();
        expect(answer.missing).toEqual(['eip155:42161']);
    });

    it('refuses a proposal that requires another family entirely', () => {
        const answer = approveNamespaces({
            required: { solana: { chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'], methods: [], events: [] } },
            optional: {},
            known,
            active: 1020,
            address
        });

        expect(answer.namespaces).toBeUndefined();
        expect(answer.missing).toEqual(['solana']);
    });

    it('refuses a proposal whose optional chains are all somewhere else', () => {
        const answer = approveNamespaces({
            required: {},
            optional: { eip155: { chains: ['eip155:42161'], methods: [], events: [] } },
            known,
            active: 1020,
            address
        });

        expect(answer.namespaces).toBeUndefined();
    });

    it('ignores an optional family it cannot serve', () => {
        const answer = approveNamespaces({
            required: {},
            optional: {
                eip155: { chains: ['eip155:1020'], methods: [], events: [] },
                solana: { chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'], methods: [], events: [] }
            },
            known,
            active: 1020,
            address
        });

        expect(Object.keys(answer.namespaces ?? {})).toEqual([namespaceKey]);
    });
});

describe('sessionAccounts', () => {
    it('moves a live session onto another account without touching its chains', () => {
        const moved = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

        const accounts = sessionAccounts(
            { chains: ['eip155:1020', 'eip155:56'], accounts: [`eip155:1020:${address}`, `eip155:56:${address}`], methods: [], events: [] },
            moved
        );

        expect(accounts).toEqual([`eip155:1020:${moved}`, `eip155:56:${moved}`]);
    });
});
