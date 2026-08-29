import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { useIsWindows } from '../hook/platform';

/**
 * Safe-area formulas that live outside `PageContainer` — surfaces that pad against the device insets
 * without being a page: the full-screen modal frame and the top sheet.
 *
 * These are plain class strings (not computed) so Tailwind's scanner picks them up at build time.
 */
export const inset = {
    sheetTop: 'pt-[env(safe-area-inset-top)]',
    modalFrame: 'pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]'
} as const;

/**
 * The stacking scale.
 *
 * There were three bare numbers and no rule, which is how the language picker ended up at `z-10`
 * while the navigation bar it had to cover sat at `z-20` — opening Settings → Language painted the
 * nav pill and the window chrome on top of the dialog, with the tabs still clickable through its
 * own scrim. Naming the three layers is what makes that class of mistake unspellable.
 *
 * `dialog` is above `chrome` by construction: a modal covers the title bar and the nav bar, always.
 * `popover` sits between them for the things that open *within* a surface — the asset picker, the
 * unlock hint — and must not escape their own page.
 */
export const layer = {
    chrome: 'z-20',
    popover: 'z-30',
    dialog: 'z-40'
} as const;

/**
 * Top padding per page variant: what clears the custom title bar on a frameless Windows window, and
 * what clears the status bar (plus a breath of space where the content starts with controls) under
 * Android's transparent system bars.
 */
const topMap = {
    tab: { windows: 'pt-8', device: 'pt-[calc(0.375rem+env(safe-area-inset-top))]' },
    browser: { windows: 'pt-8', device: 'pt-[env(safe-area-inset-top)]' },
    intro: { windows: 'pt-10', device: 'pt-[env(safe-area-inset-top)]' }
} as const;

/**
 * Everything below the top edge, per variant. `tab` is a dashboard content panel: centred, width
 * capped, and padded at the bottom by the navigation bar's height (56px items plus its 6px inset)
 * with a breath of space on top of it. `browser` is the full-bleed surface a web page owns. `intro`
 * is the intro page's own frame.
 */
const bodyMap = {
    tab: 'mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6',
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
export default function PageContainer({
    variant,
    className = '',
    children,
    ...rest
}: { variant: 'tab' | 'browser' | 'intro'; className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
    const isWindows = useIsWindows();

    return (
        <div className={cn(bodyMap[variant], isWindows ? topMap[variant].windows : topMap[variant].device, className)} {...rest}>
            {children}
        </div>
    );
}
