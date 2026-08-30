import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { useIsWindows } from '../hook/platform';

export const inset = {
    sheetTop: 'pt-[env(safe-area-inset-top)]',
    modalFrame: 'pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]',
    tabTop: { windows: 'pt-8', device: 'pt-[calc(0.375rem+env(safe-area-inset-top))]' },

    tabBottom: 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]'
} as const;

export const layer = {
    chrome: 'z-20',
    popover: 'z-30',
    dialog: 'z-40'
} as const;

const topMap = {
    browser: { windows: 'pt-8', device: 'pt-[env(safe-area-inset-top)]' },
    intro: { windows: 'pt-10', device: 'pt-[env(safe-area-inset-top)]' }
} as const;

const bodyMap = {
    tab: 'mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-4 sm:px-6',
    browser: 'flex size-full flex-col',
    intro: 'bg-base-1 flex size-full flex-col px-4 pb-4 sm:px-6 sm:pb-6'
} as const;

export default function PageContainer({
    variant,
    className = '',
    children,
    ...rest
}: { variant: 'tab' | 'browser' | 'intro'; className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
    const isWindows = useIsWindows();

    const top = variant === 'tab' ? '' : topMap[variant][isWindows ? 'windows' : 'device'];

    return (
        <div className={cn(bodyMap[variant], top, className)} {...rest}>
            {children}
        </div>
    );
}

export function ScrollFrame({ children }: { children: ReactNode }) {
    const isWindows = useIsWindows();

    return <div className={cn('size-full', inset.tabTop[isWindows ? 'windows' : 'device'], inset.tabBottom)}>{children}</div>;
}
