// Innermost last: the screen that registered most recently answers first.
const handlers: (() => boolean)[] = [];

/** A handler answers true when it took the press. */
export const pushBack = (handler: () => boolean) => {
    handlers.push(handler);

    return () => {
        const index = handlers.indexOf(handler);

        if (index !== -1) {
            handlers.splice(index, 1);
        }
    };
};

/** False when nothing in the app took the press, and the app may close. */
export const runBack = () => {
    // An open dialog or popover takes it first, as Escape, so its own rule about whether it may close still holds.
    // Not bubbling: the browser's full-screen Escape listens on window, and back has its own say there.
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: false, cancelable: true });

    if (!document.dispatchEvent(escape)) {
        return true;
    }

    for (let index = handlers.length - 1; index >= 0; index -= 1) {
        if (handlers[index]()) {
            return true;
        }
    }

    return false;
};
