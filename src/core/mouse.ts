import { getValue, setValue } from '../utility/storage';

export const defaultMouseOpacity = 0.25;

export const readMouseOpacity = (value: unknown) => {
    const opacity = Number(value);

    return Number.isFinite(opacity) && opacity >= 0.1 && opacity <= 1 ? opacity : defaultMouseOpacity;
};

let opacity = defaultMouseOpacity;
let loaded = false;

const listeners = new Set<() => void>();

const announce = () => {
    for (const listener of listeners) {
        listener();
    }
};

export const getMouseOpacity = () => opacity;

/** Reads the stored opacity once, the first time anything wants to show the mouse. */
export const subscribeMouseOpacity = (listener: () => void) => {
    listeners.add(listener);

    if (!loaded) {
        loaded = true;

        void getValue('App.Mouse')
            .catch(() => undefined)
            .then((stored) => {
                opacity = readMouseOpacity(stored);

                announce();
            });
    }

    return () => {
        listeners.delete(listener);
    };
};

export const setMouseOpacity = async (value: number) => {
    opacity = value;

    announce();

    await setValue('App.Mouse', String(value));
};
