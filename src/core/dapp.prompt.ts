import { platform } from '../platform';

export type DappPromptKind = 'connect' | 'signature' | 'typed' | 'transaction' | 'chain' | 'asset';

export interface DappPrompt {
    id: string;
    kind: DappPromptKind;
    origin: string;

    summary: string;

    transaction?: { to: string; value: string; data: string; fee: string };

    /** `added` and `from` are decided where the request is routed, never by the window drawing
        it: in an extension that window holds its own copy of the network list and the current
        network, and the worker is the one that changes both. */
    chain?: { name: string; id: number; rpc: string; added: boolean; from: { name: string; id: number } };

    asset?: { address: string; symbol: string; decimals: number };
}

/**
 * The queue of things waiting on the user.
 *
 * In a Tauri window one context both asks and answers, and the platform hooks below do nothing.
 * In an extension the two are pulled apart: the worker owns `waiting`, because a promise resolver
 * cannot be serialised anywhere, and publishes the list for whatever window is open to render.
 * That window answers by name, and the answer comes back here.
 */
const promptListeners = new Set<() => void>();

let prompts: DappPrompt[] = [];

const waiting = new Map<string, (approved: boolean) => void>();

const announcePrompts = () => {
    for (const listener of promptListeners) {
        listener();
    }
};

export const subscribePrompts = (listener: () => void) => {
    promptListeners.add(listener);

    return () => {
        promptListeners.delete(listener);
    };
};

export const getDappPrompt = () => prompts[0];

const settle = (id: string, approved: boolean) => {
    const release = waiting.get(id);

    if (release === undefined) {
        return;
    }

    waiting.delete(id);

    prompts = prompts.filter((item) => item.id !== id);

    announcePrompts();

    platform.approval.publish(prompts);

    if (prompts.length === 0) {
        platform.approval.dismiss();
    }

    release(approved);
};

export const resolveDappPrompt = (id: string, approved: boolean) => {
    if (waiting.has(id)) {
        settle(id, approved);

        return;
    }

    // Answering a queue this context does not own — the resolver lives with whoever asked.
    platform.approval.answer(id, approved);
};

export const rejectDappPrompts = () => {
    for (const id of [...waiting.keys()]) {
        settle(id, false);
    }
};

export const askDappPrompt = async (detail: Omit<DappPrompt, 'id'>) =>
    new Promise<boolean>((resolve) => {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

        waiting.set(id, resolve);

        prompts = [...prompts, { ...detail, id }];

        announcePrompts();

        platform.approval.publish(prompts);
        platform.approval.surface();
    });

// A context that does not own the queue renders the one that does.
platform.approval.subscribe((published) => {
    prompts = published;

    announcePrompts();
});
