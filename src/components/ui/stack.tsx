import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cn } from '../../utility/cn';

export function Horizontal({
    className = '',
    children,
    ...rest
}: { className?: string; children: ReactNode } & Omit<ComponentPropsWithRef<'div'>, 'className' | 'children'>) {
    return (
        <div className={cn('flex', className)} {...rest}>
            {children}
        </div>
    );
}

export function Vertical({
    className = '',
    children,
    ...rest
}: { className?: string; children: ReactNode } & Omit<ComponentPropsWithRef<'div'>, 'className' | 'children'>) {
    return (
        <div className={cn('flex flex-col', className)} {...rest}>
            {children}
        </div>
    );
}
