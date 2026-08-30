import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utility/cn';
import { surfacePanel } from './panel';

export default function ListCard({
    className = '',
    children,
    ...rest
}: { className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
    return (
        <div className={cn(surfacePanel, 'divide-y divide-line overflow-hidden rounded-surface', className)} {...rest}>
            {children}
        </div>
    );
}
