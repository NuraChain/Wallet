import { describe, expect, it } from 'vitest';

import { carriesWalletConnect, isWalletConnectLink, readWalletConnectUri } from './walletconnect.uri';

const topic = 'a09b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b';

const uri = `wc:${topic}@2?relay-protocol=irn&symKey=7f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0`;

describe('readWalletConnectUri', () => {
    it('reads a bare pairing', () => {
        expect(readWalletConnectUri(uri)).toEqual({ uri, topic, version: 2 });
    });

    it('reads the authority form a few connect modals write', () => {
        expect(readWalletConnectUri(uri.replace('wc:', 'wc://'))?.uri).toBe(uri);
    });

    it('reads a pairing wrapped in a wallet deep link', () => {
        expect(readWalletConnectUri(`nurawallet://wc?uri=${encodeURIComponent(uri)}`)?.topic).toBe(topic);
    });

    it('reads a pairing wrapped in a universal link', () => {
        expect(readWalletConnectUri(`https://nurachain.net/wc?uri=${encodeURIComponent(uri)}`)?.topic).toBe(topic);
    });

    it('reads a pairing carried in the fragment', () => {
        expect(readWalletConnectUri(`https://nurachain.net/#/wc?uri=${encodeURIComponent(uri)}`)?.topic).toBe(topic);
    });

    it('finds a pairing pasted inside other text', () => {
        expect(readWalletConnectUri(`Scan or paste this: ${uri} — it expires in five minutes.`)?.uri).toBe(uri);
    });

    it('trims the whitespace a clipboard adds', () => {
        expect(readWalletConnectUri(`\n  ${uri}  \n`)?.uri).toBe(uri);
    });

    it('reports a v1 pairing rather than pretending it can be paired', () => {
        const legacy = readWalletConnectUri('wc:8a5e5bdc-a0e4@1?bridge=https%3A%2F%2Fbridge.walletconnect.org&key=deadbeef');

        expect(legacy?.version).toBe(1);
    });

    it('turns down a v2 pairing with no key on it', () => {
        expect(readWalletConnectUri(`wc:${topic}@2?relay-protocol=irn`)).toBeUndefined();
    });

    it('turns down anything that is not a pairing', () => {
        expect(readWalletConnectUri('https://pancakeswap.finance/swap')).toBeUndefined();
        expect(readWalletConnectUri('nurawallet://dapp?request=eyJ9')).toBeUndefined();
        expect(readWalletConnectUri('')).toBeUndefined();
        expect(readWalletConnectUri('wc:')).toBeUndefined();
    });

    it('agrees with the cheap test the native layers run first', () => {
        expect(carriesWalletConnect(uri)).toBe(true);
        expect(carriesWalletConnect(`nurawallet://wc?uri=${encodeURIComponent(uri)}`)).toBe(true);
        expect(carriesWalletConnect('mailto:someone@example.com')).toBe(false);
        expect(isWalletConnectLink(uri)).toBe(true);
    });
});
