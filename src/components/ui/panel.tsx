import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utility/cn';

export const surfacePanel = 'border border-line bg-base-2';

export default function Panel({
    className = '',
    children,
    ...rest
}: { className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
    return (
        <div className={cn(surfacePanel, 'rounded-surface p-4', className)} {...rest}>
            {children}
        </div>
    );
}
