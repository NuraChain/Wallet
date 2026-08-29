import type { ReactNode } from 'react';

import { cn } from '../../utility/cn';
import { layer } from '../../layout/container';
import { surfacePanel } from './panel';
import { useDismiss } from './dialog';

/**
 * Popover - A panel that opens against the control that owns it, and a tap anywhere else closes it.
 *
 * Three surfaces had derived this independently: the send flow's asset picker, the unlock screen's
 * recovery hint and the account switcher's emoji grid. What they share is exactly this — a full-screen
 * catcher under a positioned panel — and what they do not share is anything inside it. One is a
 * listbox of assets, one is a paragraph, one is a grid of glyphs, so the contents stay with the caller
 * and only the mechanism moves here.
 *
 * The catcher is what makes an outside tap close the list, and it sits a layer *below* the panel so a
 * tap on a row still reaches the row. It is `aria-hidden` because it is a mechanism rather than
 * content — a screen reader has Escape, which `useDismiss` provides along with returning focus to
 * whatever opened this.
 *
 * Positioning is the caller's: `anchor` places the panel against whichever edge of the trigger it
 * belongs to, because a picker drops below its field while a hint hangs off the end of its button.
 * @param {object} props Component props.
 * @param {boolean} props.open Whether the panel is showing.
 * @param {() => void} props.onClose Dismisses the panel.
 * @param {string} [props.anchor] Positioning classes for the panel, relative to the nearest positioned ancestor.
 * @param {string} [props.role] ARIA role for the panel, where it is a listbox or a menu rather than a region.
 * @param {string} [props.className] Extra panel classes; conflicting utilities override the defaults.
 * @param {ReactNode} props.children The panel contents.
 * @returns {JSX.Element | undefined} The panel, or nothing while closed.
 */
export default function Popover({
    open,
    onClose,
    anchor = 'inset-x-0 top-full mt-1',
    role,
    className = '',
    children
}: {
    open: boolean;
    onClose: () => void;
    anchor?: string;
    role?: string;
    className?: string;
    children: ReactNode;
}) {
    useDismiss(open, onClose);

    if (!open) {
        return undefined;
    }

    return (
        <>
            <div aria-hidden='true' className={`fixed inset-0 ${layer.chrome}`} onClick={onClose} />

            <div role={role} className={cn(surfacePanel, 'absolute rounded-surface p-1', anchor, layer.popover, className)}>
                {children}
            </div>
        </>
    );
}
