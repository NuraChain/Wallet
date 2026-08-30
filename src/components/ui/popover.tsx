import type { ReactNode } from 'react';

import { cn } from '../../utility/cn';
import { layer } from '../../layout/container';
import { surfacePanel } from './panel';
import { useDismiss } from './dialog';

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
