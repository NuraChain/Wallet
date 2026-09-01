import { getValue, setValue } from '../utility/storage';

export interface DappEnvelope {
    id: string;
    label: string;
    origin: string;
    method: string;
    params: unknown[];

    // A caller that carries its own approval — a WalletConnect session the person accepted, whose
    // grant lives in the session itself rather than in the browser's per-origin list. Only the
    // wallet's own session handler may set it; a page's envelope is built field by field from the
    // request it sent, and never through this flag.
    granted?: boolean;
}

export interface DappFailure {
    code: number;
    message: string;
    data?: unknown;
}

export interface DappReply {
    id: string;
    result?: unknown;
    error?: DappFailure;
}

export const dappError = {
    rejected: 4001,
    unauthorized: 4100,
    unsupported: 4200,
    disconnected: 4900,
    chainMissing: 4902,
    invalidInput: -32000,
    invalidRequest: -32600,
    methodMissing: -32601,
    invalidParams: -32602,
    internal: -32603
};

export class DappError extends Error {
    public readonly code: number;
    public readonly data: unknown;

    public constructor(code: number, message: string, data?: unknown) {
        super(message);

        this.name = 'DappError';
        this.code = code;
        this.data = data;
    }
}

export const failure = (code: number, message: string, data?: unknown) => new DappError(code, message, data);

export const siteOrigin = (url: string) => {
    try {
        const parsed = new URL(url);

        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : '';
    } catch {
        return '';
    }
};

let granted: string[] = [];

export const loadConnections = async (): Promise<string[]> => {
    const stored = await getValue('Browser.Connections').catch(() => undefined);

    if (stored === undefined) {
        return granted;
    }

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(stored) as string[];

        granted = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.length > 0) : [];
    } catch {
        granted = [];
    }

    return granted;
};

export const getConnections = () => granted;

export const isConnected = (origin: string) => origin.length > 0 && granted.includes(origin);

export const grantConnection = async (origin: string) => {
    if (origin.length === 0 || granted.includes(origin)) {
        return;
    }

    granted = [...granted, origin];

    await setValue('Browser.Connections', JSON.stringify(granted));
};

export const revokeConnection = async (origin: string) => {
    if (!granted.includes(origin)) {
        return;
    }

    granted = granted.filter((item) => item !== origin);

    await setValue('Browser.Connections', JSON.stringify(granted));
};

export const clearConnections = async () => {
    granted = [];

    await setValue('Browser.Connections', JSON.stringify(granted));
};
