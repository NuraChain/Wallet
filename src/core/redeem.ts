import config from '../config';
import { httpRequest } from './request';
import type { RedeemFailure, RedeemResult } from '../type/wallet';

/** The shop that sells redeem codes; the info note links its domain here. */
export const redeemShop = config.redeemShop;

const endpoint = `${redeemShop}/api/redeem`;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const failures: readonly RedeemFailure[] = ['validation', 'not-found', 'conflict', 'rate-limited'];

export const isRedeemCode = (code: string) => uuidPattern.test(code.trim());

/** Reads the shop's answer: a 200 queues a manual USDT payout, anything else is the `error` envelope. */
export const readRedeem = (ok: boolean, body: unknown): RedeemResult => {
    if (typeof body !== 'object' || body === null) {
        return { ok: false, reason: 'failed' };
    }

    if (ok) {
        if (!('amount' in body) || typeof body.amount !== 'number' || !('wallet' in body) || typeof body.wallet !== 'string') {
            return { ok: false, reason: 'failed' };
        }

        return { ok: true, amount: body.amount, wallet: body.wallet, notified: !('notified' in body) || body.notified !== false };
    }

    const error = 'error' in body && typeof body.error === 'object' && body.error !== null ? body.error : {};
    const reason = failures.find((failure) => 'code' in error && failure === error.code);

    return { ok: false, reason: reason ?? 'failed' };
};

export const redeemCode = async (address: string, code: string): Promise<RedeemResult> => {
    try {
        const response = await httpRequest(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code.trim(), wallet_address: address })
        });

        return readRedeem(response.ok, await response.json());
    } catch {
        return { ok: false, reason: 'failed' };
    }
};
