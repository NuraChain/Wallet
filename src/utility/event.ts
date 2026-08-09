import type { JSX } from 'react';

interface EventMap
{
    'Page.Open': [component: JSX.Element];

    'Toast.Open': [component: JSX.Element];
    'Toast.Close': [id: number];

    'Modal.Open': [component: JSX.Element];
    'Modal.Close': [id: number];
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
export const on = <T extends keyof EventMap>(name: T, listener: EventCall<T>) =>
{
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
export const emit = <T extends keyof EventMap>(name: T, ...args: EventMap[T]) =>
{
    const listeners = eventMap.get(name);

    if (listeners === undefined)
    {
        return;
    }

    for (const listener of listeners)
    {
        listener(...args);
    }
};

/**
 * off - Removes a previously registered listener for an event.
 * @template T
 * @param {T} name - The event name.
 * @param {EventCall<T>} listener - The listener to remove.
 */
export const off = <T extends keyof EventMap>(name: T, listener: EventCall<T>) =>
{
    const listeners = eventMap.get(name);

    if (listeners === undefined)
    {
        return;
    }

    eventMap.set(name, listeners.filter((fn) => fn !== listener));
};
