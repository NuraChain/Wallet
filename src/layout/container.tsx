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
    modalFrame: 'pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]',
    tabTop: { windows: 'pt-8', device: 'pt-[calc(0.375rem+env(safe-area-inset-top))]' },

    /*
     * Where a scrolling tab stops at the bottom: the navigation bar's own top edge, which is its
     * 56px height plus the 16px it floats above the device inset.
     */
    tabBottom: 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]'
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
 * what clears the status bar under Android's transparent system bars.
 *
 * `tab` is absent on purpose. It is the one variant that lives inside a scroll area, so its clearance
 * belongs on the frame around that scroller — `ScrollFrame` below, off `inset.tabTop`.
 */
const topMap = {
    browser: { windows: 'pt-8', device: 'pt-[env(safe-area-inset-top)]' },
    intro: { windows: 'pt-10', device: 'pt-[env(safe-area-inset-top)]' }
} as const;

/**
 * Everything below the top edge, per variant. `tab` is a dashboard content panel: centred, width
 * capped, and carrying only a trailing breath at the bottom — clearing the navigation bar is the
 * scroll frame's job now, since the bar has to be somewhere the content cannot reach rather than
 * somewhere it is padded away from. `browser` is the full-bleed surface a web page owns. `intro`
 * is the intro page's own frame.
 */
const bodyMap = {
    tab: 'mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-4 sm:px-6',
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

    const top = variant === 'tab' ? '' : topMap[variant][isWindows ? 'windows' : 'device'];

    return (
        <div className={cn(bodyMap[variant], top, className)} {...rest}>
            {children}
        </div>
    );
}

/**
 * ScrollFrame - The frame a scrolling tab's scroll area sits in, and both of the tab's clearances.
 *
 * Neither clearance can live inside the scroller, which is the whole reason this exists. Padding
 * scrolls with what it pads: held in `PageContainer` it cleared the chrome at rest and then did
 * nothing, so a tab's content travelled up through the title bar's band and down behind the
 * navigation pill. On the frame it shortens the viewport instead — those strips stop being somewhere
 * content is drawn and then covered, and become somewhere content cannot go.
 *
 * The cost is that the bottom strip is reserved whether or not the bar is showing: the bar tucks away
 * on a downward scroll and the space it was occupying stays empty. Reclaiming it would mean resizing
 * the viewport mid-scroll, which is a reflow on every direction change — a worse trade than the idle
 * strip.
 *
 * The platform fork stays in this file for the same reason every other one does: a surface picks a
 * frame, it does not copy a formula.
 * @param {object} props Component props.
 * @param {ReactNode} props.children The scroll area.
 * @returns {JSX.Element} The frame.
 */
export function ScrollFrame({ children }: { children: ReactNode }) {
    const isWindows = useIsWindows();

    return <div className={cn('size-full', inset.tabTop[isWindows ? 'windows' : 'device'], inset.tabBottom)}>{children}</div>;
}
