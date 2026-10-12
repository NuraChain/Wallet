import { describe, expect, it } from 'vitest';

import { readRecipient } from './recipient';

const recipient = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const token = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

describe('a scanned recipient', () => {
    it('reads a bare address, which is what the receive screen draws', () => {
        expect(readRecipient(recipient)).toEqual({ address: recipient });
        expect(readRecipient(`  ${recipient}\n`)).toEqual({ address: recipient });
    });

    it('gives an address back in its checksummed form', () => {
        expect(readRecipient(recipient.toLowerCase())).toEqual({ address: recipient });
    });

    it('refuses an address whose checksum does not hold', () => {
        expect(readRecipient(recipient.replace('C5', 'c5'))).toBeUndefined();
    });

    it('reads a payment request, with or without its prefix, chain and amount', () => {
        expect(readRecipient(`ethereum:${recipient}`)).toEqual({ address: recipient });
        expect(readRecipient(`ethereum:pay-${recipient}`)).toEqual({ address: recipient });
        expect(readRecipient(`ETHEREUM:${recipient}?value=1e18`)).toEqual({ address: recipient });
        expect(readRecipient(`ethereum:${recipient}@1020?value=2.014e18&gas=21000`)).toEqual({ address: recipient, chainId: 1020 });
    });

    it('pays the recipient of a token request, never the token it names first', () => {
        const scanned = readRecipient(`ethereum:${token}@1/transfer?address=${recipient}&uint256=1000000`);

        expect(scanned).toEqual({ address: recipient, chainId: 1 });
        expect(scanned?.address).not.toBe(token);
    });

    it('refuses a token request that names nobody to pay', () => {
        expect(readRecipient(`ethereum:${token}/transfer`)).toBeUndefined();
        expect(readRecipient(`ethereum:${token}/transfer?uint256=1`)).toBeUndefined();
        expect(readRecipient(`ethereum:${token}/transfer?address=0x1234`)).toBeUndefined();
    });

    it('refuses any call that is not a transfer', () => {
        expect(readRecipient(`ethereum:${token}/approve?address=${recipient}&uint256=1`)).toBeUndefined();
        expect(readRecipient(`ethereum:${token}/transferFrom?address=${recipient}`)).toBeUndefined();
    });

    it('refuses what is not an address at all', () => {
        expect(readRecipient('')).toBeUndefined();
        expect(readRecipient('https://example.com')).toBeUndefined();
        expect(readRecipient('ethereum:vitalik.eth')).toBeUndefined();
        expect(readRecipient(recipient.slice(2))).toBeUndefined();
        expect(readRecipient(`${recipient}00`)).toBeUndefined();
        expect(readRecipient(`bitcoin:${recipient}`)).toBeUndefined();
        expect(readRecipient(`ethereum:${recipient}@999999999999999999999999`)).toBeUndefined();
    });
});
