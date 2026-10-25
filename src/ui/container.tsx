import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { useHasStatusBar, useIsWindows } from '../hook/platform';
import { useTint } from '../hook/tint';

export const inset = {
    sheetTop: 'pt-[var(--inset-top)]',
    modalFrame: 'pt-[calc(1rem+var(--inset-top))] pb-[calc(1rem+var(--inset-bottom))]',
    tabTop: { windows: 'pt-8', device: 'pt-[calc(0.375rem+var(--inset-top))]' },

    tabBottom: 'pb-[calc(1.5rem+var(--inset-bottom))]',

    edgeBottom: 'pb-[calc(1rem+var(--inset-bottom))] sm:pb-[calc(1.5rem+var(--inset-bottom))]'
} as const;

export const layer = {
    base: 'z-10',
    chrome: 'z-20',
    popover: 'z-30',
    dialog: 'z-40',
    // A browser tab is a native view no z-index reaches, so an open page still covers this.
    mouse: 'z-100'
} as const;

const topMap = {
    browser: { windows: 'pt-8', device: 'pt-[var(--inset-top)]' },
    intro: { windows: 'pt-10', device: 'pt-[var(--inset-top)]' }
} as const;

const bodyMap = {
    tab: 'mx-auto flex min-h-full w-full max-w-lg flex-col px-4 sm:px-6 lg:max-w-4xl',
    // Runs under a gesture bar or iOS home indicator; stopping short leaves a strip of wallet colour.
    browser: 'relative flex size-full flex-col pb-[var(--inset-bar)]',
    intro: `bg-base-1 flex size-full flex-col px-4 sm:px-6 ${inset.edgeBottom}`
} as const;

// The site's colour arrives at runtime, so it is a style rather than a class.
function BarTint() {
    const tint = useTint();

    return (
        <div
            style={tint.length > 0 ? { backgroundColor: tint } : undefined}
            className='pointer-events-none absolute inset-x-0 top-0 h-[var(--inset-top)] transition-[background-color] duration-(--duration-base)'
        />
    );
}

export default function PageContainer({
    variant,
    center = false,
    bar = false,
    children,
    ...rest
}: {
    variant: 'tab' | 'browser' | 'intro';
    center?: boolean;
    /** A tab with the nav bar under it, which owns the bottom inset. */
    bar?: boolean;
    children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
    const isWindows = useIsWindows();
    const hasStatusBar = useHasStatusBar();

    const top = variant === 'tab' ? '' : topMap[variant][isWindows ? 'windows' : 'device'];

    return (
        <div className={cn(bodyMap[variant], variant === 'tab' && (bar ? 'pb-6' : inset.tabBottom), top, center && 'items-center justify-center')} {...rest}>
            {variant === 'browser' && hasStatusBar && <BarTint />}

            {children}
        </div>
    );
}

export function ScrollFrame({ children }: { children: ReactNode }) {
    const isWindows = useIsWindows();

    return <div className={cn('size-full', inset.tabTop[isWindows ? 'windows' : 'device'])}>{children}</div>;
}
