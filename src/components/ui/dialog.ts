import { createContext, use, useEffect, useId, useRef } from 'react';

/**
 * The dialogs currently on screen, innermost last.
 *
 * Escape has to reach exactly one of them — the one on top — and the app genuinely stacks: Settings
 * opens Language, and the browser's settings sheet opens its own confirmations. A single document
 * listener per dialog would fire all of them at once and close the whole stack on one key, so the
 * listener is registered once here and the stack decides who answers.
 */
const stack: (() => void)[] = [];

/**
 * onKeyDown - Closes the topmost dialog on Escape.
 * @param {KeyboardEvent} event The key event.
 * @returns {void}
 */
const onKeyDown = (event: KeyboardEvent) =>
{
    if (event.key !== 'Escape' || stack.length === 0)
    {
        return;
    }

    event.stopPropagation();

    stack[stack.length - 1]();
};

/**
 * What counts as reachable by Tab. `[tabindex="-1"]` is deliberately excluded: it is focusable by
 * script, which is how the panel itself takes initial focus, but it is not a stop on the tab ring.
 */
const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * useDialog - Gives a surface the behaviour that makes it a dialog rather than a floating div.
 *
 * None of this existed. Thirteen dialogs — including the one that approves a transaction or a
 * signature for a dApp — rendered as plain `div`s: no role, no name, nothing stopping Tab walking
 * straight out of the panel and into the page behind the scrim, and no way to dismiss them from the
 * keyboard at all. `grep Escape src/` returned nothing across the whole app.
 *
 * It is a hook rather than a component because the two placements the app has — the centred modal
 * and the sheet that drops from the top — share none of their markup or motion and all of their
 * behaviour. Merging them into one component with a `placement` prop would have rewritten fifteen
 * call sites to fix something none of those call sites are expressing.
 *
 * Four things happen here:
 *
 * - the panel is named, via an id the caller puts on its title, so a screen reader announces what
 *   opened rather than just that something did;
 * - focus moves into the panel on open and returns to whatever opened it on close, so dismissing a
 *   dialog does not dump the user back at the top of the document;
 * - Tab cycles inside the panel;
 * - Escape closes the topmost dialog.
 *
 * `onClose` is read through a ref so that a caller passing an inline arrow does not re-register the
 * listener on every render, which would make the stack order depend on render timing.
 * @param {() => void} onClose Dismisses this dialog.
 * @returns {{ panelRef: React.RefObject<HTMLDivElement | null>, titleId: string }} The ref to put on the panel, and the id to put on its title.
 */
export const useDialog = (onClose: () => void) =>
{
    const panelRef = useRef<HTMLDivElement>(null);

    const titleId = `${ useId() }-title`;

    const closeRef = useRef(onClose);

    closeRef.current = onClose;

    useEffect(() =>
    {
        const panel = panelRef.current;

        if (panel === null)
        {
            return undefined;
        }

        // `document.activeElement` at mount is whatever the user pressed to get here.
        const opener = document.activeElement;

        /**
         * close - Calls the caller's latest handler.
         * @returns {void}
         */
        const close = () => { closeRef.current(); };

        stack.push(close);

        if (stack.length === 1)
        {
            document.addEventListener('keydown', onKeyDown);
        }

        /**
         * onTab - Wraps Tab around the panel's own focusable elements.
         * @param {KeyboardEvent} event The key event.
         * @returns {void}
         */
        const onTab = (event: KeyboardEvent) =>
        {
            if (event.key !== 'Tab')
            {
                return;
            }

            const items = [ ...panel.querySelectorAll<HTMLElement>(focusableSelector) ].filter((item) => item.offsetParent !== null);

            if (items.length === 0)
            {
                event.preventDefault();

                return;
            }

            const first = items[0];
            const last = items[items.length - 1];

            // Focus sitting on the panel itself counts as being at the start of the ring, so
            // Shift+Tab from there wraps to the end rather than escaping into the page.
            const active = document.activeElement;

            if (event.shiftKey && (active === first || active === panel))
            {
                event.preventDefault();

                last.focus();
            }
            else if (!event.shiftKey && active === last)
            {
                event.preventDefault();

                first.focus();
            }
        };

        panel.addEventListener('keydown', onTab);

        // The panel takes focus itself rather than handing it to the first control, which on most of
        // these dialogs is the close button — landing there reads as "you are about to dismiss this"
        // before the user has been told what "this" is.
        panel.focus({ preventScroll: true });

        return () =>
        {
            panel.removeEventListener('keydown', onTab);

            const index = stack.indexOf(close);

            if (index >= 0)
            {
                stack.splice(index, 1);
            }

            if (stack.length === 0)
            {
                document.removeEventListener('keydown', onKeyDown);
            }

            if (opener instanceof HTMLElement && opener.isConnected)
            {
                opener.focus({ preventScroll: true });
            }
        };
    }, [ ]);

    return { panelRef, titleId };
};

/**
 * The id of the current dialog's title, published so the header can claim it.
 *
 * `Modal` owns the id because it is the element carrying `aria-labelledby`, but the element the id
 * has to land on is rendered by `ModalHeader`, arbitrarily deep in the caller's children. Passing it
 * down by prop would mean every one of the fourteen dialogs threading a value none of them cares
 * about; context is what keeps the name a property of the dialog rather than a chore for its author.
 */
/*
 * Suspended for the same reason as the `as` parameter in `ui/text.tsx`: JSX reads a lowercase
 * identifier as an intrinsic element, so a context rendered as `<DialogTitleContext value={...}>`
 * cannot be spelled in camelCase and remain a context.
 */
/* eslint-disable-next-line @typescript-eslint/naming-convention */
export const DialogTitleContext = createContext<string | undefined>(undefined);

/**
 * useDialogTitleId - The id this dialog's title should carry, or `undefined` outside a dialog.
 * @returns {string | undefined} The id.
 */
export const useDialogTitleId = () => use(DialogTitleContext);
