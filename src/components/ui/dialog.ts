import { createContext, use, useEffect, useId, useRef } from 'react';

const stack: (() => void)[] = [];

const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || stack.length === 0) {
        return;
    }

    event.stopPropagation();

    stack[stack.length - 1]();
};

const focusableSelector =
    'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export const useDismiss = (active: boolean, onClose: () => void) => {
    const closeRef = useRef(onClose);

    closeRef.current = onClose;

    useEffect(() => {
        if (!active) {
            return undefined;
        }

        const opener = document.activeElement;

        const close = () => {
            closeRef.current();
        };

        stack.push(close);

        if (stack.length === 1) {
            document.addEventListener('keydown', onKeyDown);
        }

        return () => {
            const index = stack.indexOf(close);

            if (index !== -1) {
                stack.splice(index, 1);
            }

            if (stack.length === 0) {
                document.removeEventListener('keydown', onKeyDown);
            }

            queueMicrotask(() => {
                const holder = document.activeElement;

                if (holder !== null && holder !== document.body) {
                    return;
                }

                if (opener instanceof HTMLElement && opener.isConnected) {
                    opener.focus({ preventScroll: true });
                }
            });
        };
    }, [active]);
};

export const useDialog = (onClose: () => void) => {
    const panelRef = useRef<HTMLDivElement>(null);

    const titleId = `${useId()}-title`;

    useDismiss(true, onClose);

    useEffect(() => {
        const panel = panelRef.current;

        if (panel === null) {
            return undefined;
        }

        const onTab = (event: KeyboardEvent) => {
            if (event.key !== 'Tab') {
                return;
            }

            const items = [...panel.querySelectorAll<HTMLElement>(focusableSelector)].filter((item) => item.offsetParent !== null);

            if (items.length === 0) {
                event.preventDefault();

                return;
            }

            const first = items[0];
            const last = items[items.length - 1];

            const active = document.activeElement;

            if (event.shiftKey && (active === first || active === panel)) {
                event.preventDefault();

                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();

                first.focus();
            }
        };

        panel.addEventListener('keydown', onTab);

        panel.focus({ preventScroll: true });

        return () => {
            panel.removeEventListener('keydown', onTab);
        };
    }, []);

    return { panelRef, titleId };
};

/* oxlint-disable-next-line @typescript-eslint/naming-convention */
export const DialogTitleContext = createContext<string | undefined>(undefined);

export const useDialogTitleId = () => use(DialogTitleContext);
