import type { LanguageType } from './language';

/**
 * The events this bus carries.
 *
 * It used to carry navigation too — `Page.Open` handed a rendered element to a layout that held one
 * page at a time — along with reserved `Toast.*` and `Modal.*` entries that nothing ever emitted or
 * listened for. Navigation is React Router's job now, and the reserved entries went with it rather
 * than sitting here describing a feature that does not exist.
 *
 * What is left is the two module singletons that need to tell React they changed.
 */
interface EventMap {
    // `language.ts` imports `emit` from here at runtime, so this direction has to stay type-only or
    // the two modules form a cycle. `import type` is erased before the bundler sees it.
    'Language.Change': [code: LanguageType];

    // Same direction and the same reason: `connection.ts` emits this and nothing here imports it back.
    'Connection.Change': [online: boolean];
}

type EventCall<T extends keyof EventMap> = (...args: EventMap[T]) => void;

/**
 * eventMap - Internal map storing listeners by event name.
 * @type {Map<keyof EventMap, EventCall<keyof EventMap>[]>}
 */
const eventMap = new Map<keyof EventMap, EventCall<keyof EventMap>[]>();

/**
 * on - Registers a listener for the specified event name.
 * @template T
 * @param {T} name - The event name to listen for.
 * @param {EventCall<T>} listener - The callback invoked when the event is emitted.
 */
export const on = <T extends keyof EventMap>(name: T, listener: EventCall<T>) => {
    const listeners = eventMap.get(name) ?? [];

    // @ts-expect-error - TypeScript cannot infer the correct type for listeners, but we ensure type safety through the function signature.
    listeners.push(listener);

    eventMap.set(name, listeners);
};

/**
 * emit - Invokes every listener registered for the event name.
 * @template T
 * @param {T} name - The event name to emit.
 * @param {...EventMap[T]} args - Arguments forwarded to each listener.
 */
export const emit = <T extends keyof EventMap>(name: T, ...args: EventMap[T]) => {
    const listeners = eventMap.get(name);

    if (listeners === undefined) {
        return;
    }

    for (const listener of listeners) {
        listener(...args);
    }
};

/**
 * off - Removes a previously registered listener for an event.
 * @template T
 * @param {T} name - The event name.
 * @param {EventCall<T>} listener - The listener to remove.
 */
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
