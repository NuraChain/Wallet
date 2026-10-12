import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { useHasStatusBar, useIsWindows } from '../hook/platform';
import { useTint } from '../hook/tint';

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
    /* A page keeps clear only of what takes taps at the bottom of the screen. Under a gesture bar,
       or the home indicator on iOS, it runs to the edge, which is what makes that bar read as
       transparent over a site: stopping short left a strip of the wallet's own colour beneath
       every page. */
    browser: 'relative flex size-full flex-col pb-[var(--inset-bar)]',
    intro: `bg-base-1 flex size-full flex-col px-4 sm:px-6 ${inset.edgeBottom}`
} as const;

/**
 * The strip a phone's status bar is drawn over, above a page in the browser. It wears the colour
 * that page asks for, as the bar of a browser does, and is as tall as the inset. It is drawn on a
 * phone and nowhere else: on Windows, macOS and Linux the top of the window is the window's own,
 * and keeps the wallet's colours whatever page is open. The colour is the site's and arrives at
 * runtime, which is why it is a style here and not a class.
 */
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
    children,
    ...rest
}: {
    variant: 'tab' | 'browser' | 'intro';
    /** Holds a single card in the middle of the page, as the unlock screen does. */
    center?: boolean;
    children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
    const isWindows = useIsWindows();
    const hasStatusBar = useHasStatusBar();

    const top = variant === 'tab' ? '' : topMap[variant][isWindows ? 'windows' : 'device'];

    return (
        <div className={cn(bodyMap[variant], top, center && 'items-center justify-center')} {...rest}>
            {variant === 'browser' && hasStatusBar && <BarTint />}

            {children}
        </div>
    );
}

export function ScrollFrame({ children }: { children: ReactNode }) {
    const isWindows = useIsWindows();

    return <div className={cn('size-full', inset.tabTop[isWindows ? 'windows' : 'device'])}>{children}</div>;
}
