import { httpRequest } from './request';

const endpoint = '';

export type RedeemResult = { ok: true; message: string } | { ok: false; message: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const isRedeemCode = (code: string) => uuidPattern.test(code.trim());

export const redeemCode = async (address: string, code: string): Promise<RedeemResult> => {
    const trimmed = code.trim();

    if (endpoint.length === 0) {
        await new Promise((resolve) => {
            setTimeout(resolve, 900);
        });

        return { ok: true, message: `Stub: code ${trimmed} accepted for ${address}. No request was sent — the endpoint is not configured yet.` };
    }

    try {
        const response = await httpRequest(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, code: trimmed })
        });

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const body = (await response.json()) as { message?: unknown };

        const message = typeof body.message === 'string' ? body.message : '';

        return response.ok ? { ok: true, message } : { ok: false, message };
    } catch {
        return { ok: false, message: '' };
    }
};
