import { platform } from '../platform';
import type { DappPrompt } from '../type/dapp';

// In an extension the worker owns `waiting` (a resolver cannot be serialised); a window renders it and answers by id.
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

platform.approval.subscribe((published) => {
    prompts = published;

    announcePrompts();
});
