import type { LanguageType } from './language';

interface EventMap {
    'Language.Change': [code: LanguageType];

    'Connection.Change': [online: boolean];
}

type EventCall<T extends keyof EventMap> = (...args: EventMap[T]) => void;

const eventMap = new Map<keyof EventMap, EventCall<keyof EventMap>[]>();

export const on = <T extends keyof EventMap>(name: T, listener: EventCall<T>) => {
    const listeners = eventMap.get(name) ?? [];

    // @ts-expect-error - TypeScript cannot infer the correct type for listeners, but we ensure type safety through the function signature.
    listeners.push(listener);

    eventMap.set(name, listeners);
};

export const emit = <T extends keyof EventMap>(name: T, ...args: EventMap[T]) => {
    const listeners = eventMap.get(name);

    if (listeners === undefined) {
        return;
    }

    for (const listener of listeners) {
        listener(...args);
    }
};

export const off = <T extends keyof EventMap>(name: T, listener: EventCall<T>) => {
    const listeners = eventMap.get(name);

    if (listeners === undefined) {
        return;
    }

    eventMap.set(
        name,
        listeners.filter((fn) => fn !== listener)
    );
};
