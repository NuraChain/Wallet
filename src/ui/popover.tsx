import type { ReactNode } from 'react';

import { cn } from '../utility/cn';
import { layer } from './container';
import { surfacePanel } from './panel';
import { useDismiss } from './dialog';

// Where it opens from: under its trigger, or tucked under the trigger's corner.
const anchorMap = { below: 'inset-x-0 top-full mt-1', corner: 'inset-e-0 top-12' } as const;

const lookMap = {
    /** A short scrolling list of choices. */
    list: 'flex max-h-56 flex-col gap-1 overflow-y-auto',
    /** A few lines of help text. */
    note: 'w-56 p-3 text-start text-tiny text-txt-normal'
} as const;

export default function Popover({
    open,
    onClose,
    anchor = 'below',
    look,
    role,
    children
}: {
    open: boolean;
    onClose: () => void;
    anchor?: keyof typeof anchorMap;
    look?: keyof typeof lookMap;
    role?: string;
    children: ReactNode;
}) {
    useDismiss(open, onClose);

    if (!open) {
        return undefined;
    }

    return (
        <>
            <div className={`fixed inset-0 ${layer.chrome}`} onClick={onClose} />

            <div
                role={role}
                className={cn(surfacePanel, 'absolute rounded-surface p-1', anchorMap[anchor], layer.popover, look !== undefined && lookMap[look])}
            >
                {children}
            </div>
        </>
    );
}

/** The trigger's wrapper: the panel positions against it, and it lifts both above the page. */
export function PopoverAnchor({ children }: { children: ReactNode }) {
    return <div className={`relative ${layer.popover}`}>{children}</div>;
}
