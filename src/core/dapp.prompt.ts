import { platform } from '../platform';
import type { DappAnswer, DappGas, DappPrompt } from '../type/dapp';

// In an extension the worker owns `waiting` (a resolver cannot be serialised); a window renders it and answers by id.
const promptListeners = new Set<() => void>();

let prompts: DappPrompt[] = [];

const waiting = new Map<string, (answer: DappAnswer) => void>();

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

const settle = (id: string, answer: DappAnswer) => {
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

    release(answer);
};

export const resolveDappPrompt = (id: string, approved: boolean, gas?: DappGas) => {
    if (waiting.has(id)) {
        settle(id, { approved, gas: approved ? gas : undefined });

        return;
    }

    platform.approval.answer(id, approved, gas);
};

export const rejectDappPrompts = () => {
    for (const id of [...waiting.keys()]) {
        settle(id, { approved: false });
    }
};

export const askDappAnswer = async (detail: Omit<DappPrompt, 'id'>) =>
    new Promise<DappAnswer>((resolve) => {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

        waiting.set(id, resolve);

        prompts = [...prompts, { ...detail, id }];

        announcePrompts();

        platform.approval.publish(prompts);
        platform.approval.surface();
    });

export const askDappPrompt = async (detail: Omit<DappPrompt, 'id'>) => (await askDappAnswer(detail)).approved;

platform.approval.subscribe((published) => {
    prompts = published;

    announcePrompts();
});
