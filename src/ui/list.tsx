import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { surfacePanel } from './panel';

export default function ListCard({
    flush = false,
    children,
    ...rest
}: {
    flush?: boolean;
    children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
    return (
        <div className={cn(surfacePanel, 'divide-y divide-line overflow-hidden rounded-surface', flush && 'h-full rounded-none')} {...rest}>
            {children}
        </div>
    );
}
