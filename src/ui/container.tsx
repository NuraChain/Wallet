import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { useIsWindows } from '../hook/platform';

export const inset = {
    sheetTop: 'pt-[var(--inset-top)]',
    modalFrame: 'pt-[calc(1rem+var(--inset-top))] pb-[calc(1rem+var(--inset-bottom))]',
    tabTop: { windows: 'pt-8', device: 'pt-[calc(0.375rem+var(--inset-top))]' },

    tabBottom: 'pb-[calc(1.5rem+var(--inset-bottom))]',

    /* The gutter a surface that runs all the way to the bottom of the screen keeps under itself —
       the sheet, the intro and unlock pages — with the navigation bar's inset beneath it. */
    edgeBottom: 'pb-[calc(1rem+var(--inset-bottom))] sm:pb-[calc(1.5rem+var(--inset-bottom))]'
} as const;

export const layer = {
    /* Below the chrome: an overlay thumb or a pull indicator rides over its own scrolling content
       and under everything the shell draws on top of it. */
    base: 'z-10',
    chrome: 'z-20',
    popover: 'z-30',
    dialog: 'z-40',
    /* The floating mouse, over every screen and dialog the wallet draws. A browser tab is an OS
       view no z-index reaches, so an open page still covers it. */
    mouse: 'z-100'
} as const;

const topMap = {
    browser: { windows: 'pt-8', device: 'pt-[var(--inset-top)]' },
    intro: { windows: 'pt-10', device: 'pt-[var(--inset-top)]' }
} as const;

const bodyMap = {
    tab: `mx-auto flex min-h-full w-full max-w-lg flex-col px-4 sm:px-6 lg:max-w-4xl ${inset.tabBottom}`,
    /* A page keeps clear only of what takes taps at the bottom of the screen. Under a gesture bar
       it runs to the edge, which is what makes that bar read as transparent over a site: stopping
       short left a strip of the wallet's own colour beneath every page. */
    browser: 'flex size-full flex-col pb-[var(--inset-bar)]',
    intro: `bg-base-1 flex size-full flex-col px-4 sm:px-6 ${inset.edgeBottom}`
} as const;

export default function PageContainer({
    variant,
    center = false,
    children,
    ...rest
}: {
    variant: 'tab' | 'browser' | 'intro';
    /** Holds a single card in the middle of the page, as the unlock screen does. */
    center?: boolean;
    children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
    const isWindows = useIsWindows();

    const top = variant === 'tab' ? '' : topMap[variant][isWindows ? 'windows' : 'device'];

    return (
        <div className={cn(bodyMap[variant], top, center && 'items-center justify-center')} {...rest}>
            {children}
        </div>
    );
}

export function ScrollFrame({ children }: { children: ReactNode }) {
    const isWindows = useIsWindows();

    return <div className={cn('size-full', inset.tabTop[isWindows ? 'windows' : 'device'])}>{children}</div>;
}
