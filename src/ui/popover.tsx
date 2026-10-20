import type { ReactNode } from 'react';

import { cn } from '../utility/cn';
import { layer } from './container';
import { surfacePanel } from './panel';
import { useDismiss } from './dialog';

const anchorMap = { below: 'inset-x-0 top-full mt-1', corner: 'inset-e-0 top-full mt-2' } as const;

const lookMap = {
    list: 'flex max-h-56 flex-col gap-1 overflow-y-auto',
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

export function PopoverAnchor({ children }: { children: ReactNode }) {
    return <div className={`relative ${layer.popover}`}>{children}</div>;
}
