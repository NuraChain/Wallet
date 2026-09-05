import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { useIsWindows } from '../hook/platform';

export const inset = {
    sheetTop: 'pt-[var(--inset-top)]',
    modalFrame: 'pt-[calc(1rem+var(--inset-top))] pb-[calc(1rem+var(--inset-bottom))]',
    tabTop: { windows: 'pt-8', device: 'pt-[calc(0.375rem+var(--inset-top))]' },

    tabBottom: 'pb-[calc(5.5rem+var(--inset-bottom))] lg:pb-[calc(1.5rem+var(--inset-bottom))]',

    /* The gutter a surface that runs all the way to the bottom of the screen keeps under itself —
       the sheet, the intro and unlock pages — with the navigation bar's inset beneath it. */
    edgeBottom: 'pb-[calc(1rem+var(--inset-bottom))] sm:pb-[calc(1.5rem+var(--inset-bottom))]'
} as const;

export const layer = {
    chrome: 'z-20',
    popover: 'z-30',
    dialog: 'z-40'
} as const;

const topMap = {
    browser: { windows: 'pt-8', device: 'pt-[var(--inset-top)]' },
    intro: { windows: 'pt-10', device: 'pt-[var(--inset-top)]' }
} as const;

const bodyMap = {
    tab: `mx-auto flex min-h-full w-full max-w-lg flex-col px-4 sm:px-6 lg:max-w-4xl ${inset.tabBottom}`,
    browser: 'flex size-full flex-col pb-[var(--inset-bottom)]',
    intro: `bg-base-1 flex size-full flex-col px-4 sm:px-6 ${inset.edgeBottom}`
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

    return <div className={cn('size-full', inset.tabTop[isWindows ? 'windows' : 'device'])}>{children}</div>;
}
