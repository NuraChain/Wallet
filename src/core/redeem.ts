import { httpRequest } from './request';

/**
 * Redeem endpoint.
 *
 * PLACEHOLDER — no endpoint has been supplied yet. While this is empty every redeem resolves through
 * the stub below instead of touching the network, so the screen is usable without a backend.
 *
 * Putting the real base URL here starts the actual request, and one thing goes with it: this is an
 * address of ours carrying a wallet address and a code, so it belongs on the native client rather than
 * the webview. Add its host to `nativeHosts` in [request.ts](request.ts) and to the `http:default`
 * scope in all three capability blocks at the same time. Left out of both it still works — the request
 * falls to the webview and is subject to whatever CORS header the backend sends.
 */
const endpoint = '';

/**
 * Outcome of a redeem attempt. `message` is a server-supplied string and is shown as-is, so the
 * backend owns its own wording rather than needing a translation key per case.
 */
export type RedeemResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Canonical UUID shape, any version. Checked client-side purely to catch typos before a round trip —
 * the server is still the authority on whether a code is real, unused and owned by this address.
 */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * isRedeemCode - Whether a string looks like a redeem code.
 * @param {string} code The code the user typed.
 * @returns {boolean} True when it matches the UUID shape.
 */
export const isRedeemCode = (code: string) => uuidPattern.test(code.trim());

/**
 * redeemCode - Submits a redeem code for an address.
 *
 * Network and server errors both surface as a resolved `ok: false` rather than a throw, so the caller
 * has one shape to render and cannot leave the user staring at a spinner.
 * @param {string} address The wallet address the reward should go to.
 * @param {string} code The redeem code.
 * @returns {Promise<RedeemResult>} What happened.
 */
export const redeemCode = async(address: string, code: string): Promise<RedeemResult> =>
{
    const trimmed = code.trim();

    if (endpoint.length === 0)
    {
        // Stub: accept anything well-formed, with a short delay so the pending state is visible.
        await new Promise((resolve) => { setTimeout(resolve, 900); });

        return { ok: true, message: `Stub: code ${ trimmed } accepted for ${ address }. No request was sent — the endpoint is not configured yet.` };
    }

    try
    {
        const response = await httpRequest(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, code: trimmed })
        });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const body = await response.json() as { message?: unknown };

        const message = typeof body.message === 'string' ? body.message : '';

        return response.ok ? { ok: true, message } : { ok: false, message };
    }
    catch
    {
        return { ok: false, message: '' };
    }
};
