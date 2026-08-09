import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { useIsWindows } from '../hook/platform';

/**
 * Safe-area formulas that live outside `PageContainer` — surfaces that pad against the device insets
 * without being a page: the navigation bar's resting offset and the full-screen modal frame.
 *
 * These are plain class strings (not computed) so Tailwind's scanner picks them up at build time.
 */
export const inset =
{
    navBottom: 'bottom-[calc(1rem+env(safe-area-inset-bottom))]',
    sheetTop: 'pt-[env(safe-area-inset-top)]',
    modalFrame: 'pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]'
} as const;

/**
 * Top padding per page variant: what clears the custom title bar on a frameless Windows window, and
 * what clears the status bar (plus a breath of space where the content starts with controls) under
 * Android's transparent system bars.
 */
const topMap =
{
    tab: { windows: 'pt-8', device: 'pt-[calc(0.375rem+env(safe-area-inset-top))]' },
    browser: { windows: 'pt-8', device: 'pt-[env(safe-area-inset-top)]' },
    intro: { windows: 'pt-10', device: 'pt-[env(safe-area-inset-top)]' }
} as const;

/**
 * Everything below the top edge, per variant. `tab` is a dashboard content panel: centred, width
 * capped, and padded at the bottom by exactly the nav bar's height plus the device inset. `browser`
 * is the full-bleed surface a web page owns. `intro` is the intro page's own frame.
 */
const bodyMap =
{
    tab: 'mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6',
    browser: 'flex size-full flex-col',
    intro: 'bg-base-1 flex size-full flex-col px-4 pb-4 sm:px-6 sm:pb-6'
} as const;

/**
 * PageContainer - Platform-aware page frame.
 *
 * Every top-level surface gets its top padding from here instead of hand-writing the
 * `isWindows ? title bar : safe area` fork: on Windows the frameless window's title bar is cleared,
 * everywhere else the device inset is. Adding a page means picking a variant, not copying a formula.
 * @param {object} props Component props.
 * @param {'tab' | 'browser' | 'intro'} props.variant Which page frame to render.
 * @param {string} [props.className] Extra classes; conflicting utilities override the variant's.
 * @param {ReactNode} props.children The page content.
 * @returns {JSX.Element} The page frame.
 */
export default function PageContainer({ variant, className = '', children, ...rest }: { variant: 'tab' | 'browser' | 'intro'; className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>)
{
    const isWindows = useIsWindows();

    return (
        <div
            className={ cn(bodyMap[variant], isWindows ? topMap[variant].windows : topMap[variant].device, className) }
            { ...rest }>

            { children }

        </div>
    );
}
