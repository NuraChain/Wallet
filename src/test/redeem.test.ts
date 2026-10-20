import { describe, expect, it } from 'vitest';

import { isRedeemCode, readRedeem } from '../core/redeem';

const wallet = '0x2Ef2D5A095Fd5Ecd686d99eD3cd1F9ff91fc3167';

describe('a redeem code', () => {
    it('is a uuid, in any case and with whitespace around it', () => {
        expect(isRedeemCode(' 3F2B8C1E-9a4d-4e7b-8f21-6c5d0a9e7b14\n')).toBe(true);
        expect(isRedeemCode('3f2b8c1e-9a4d-4e7b-8f21')).toBe(false);
    });
});

describe("the shop's answer", () => {
    it('reads a queued payout', () => {
        expect(readRedeem(true, { amount: 10, wallet, at: '2026-10-20T15:42:07.318Z', notified: true })).toEqual({
            ok: true,
            amount: 10,
            wallet,
            notified: true
        });
        expect(readRedeem(true, { amount: 10, wallet, notified: false })).toEqual({ ok: true, amount: 10, wallet, notified: false });
    });

    it('treats a 200 it cannot read as a failure', () => {
        expect(readRedeem(true, { message: 'ok' })).toEqual({ ok: false, reason: 'failed' });
        expect(readRedeem(true, null)).toEqual({ ok: false, reason: 'failed' });
    });

    it('reads the error envelope by its code, never its persian message', () => {
        for (const code of ['validation', 'not-found', 'conflict', 'rate-limited'] as const) {
            expect(readRedeem(false, { error: { code, message: 'متن' } })).toEqual({ ok: false, reason: code });
        }

        expect(readRedeem(false, { error: { code: 'internal', message: 'متن' } })).toEqual({ ok: false, reason: 'failed' });
        expect(readRedeem(false, { error: 'nope' })).toEqual({ ok: false, reason: 'failed' });
        expect(readRedeem(false, {})).toEqual({ ok: false, reason: 'failed' });
    });
});
