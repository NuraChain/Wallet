import type { ReactNode } from 'react';

import Button from './button';

import { cn } from '../utility/cn';
import { inkOn } from '../utility/color';
import { useTint } from '../hook/tint';

import type { Placement } from './place';

/* Over a site's colour, the focus ring of everything on the bar is the bar's own ink. The wallet's
   ring is a blue a site may well have chosen for itself, and a ring drawn in the colour under it
   is no ring. */
const ringMap = { dark: '[--focus-ring:var(--tint-dark)]', light: '[--focus-ring:var(--tint-light)]' } as const;

const tintMap = { dark: 'tintDark', light: 'tintLight' } as const;

/**
 * The strip of controls across the top of the browser: its address bar, and its tab list.
 *
 * On a phone, over a page, it wears the colour that page asks for, and the strip under the status
 * bar wears it too, so the two read as one. In a desktop window there is no tint to wear: the bar
 * stays the wallet's whatever page is open, as the title bar above it does. Where it is worn, the
 * buttons on the bar wear it with it — see `ToolbarButton` — and the address field does not. The
 * field, with the lock or the warning in it, stays the wallet's own opaque surface in the wallet's
 * own ink. It is what tells the user where they are, and a site does not get to restyle that or to
 * wash it out. The colour is the site's and known only at runtime, which is why it is a style here
 * and not a class.
 */
export default function Toolbar({ children }: { children: ReactNode }) {
    const tint = useTint();

    const tinted = tint.length > 0;

    return (
        <div
            style={tinted ? { backgroundColor: tint } : undefined}
            className={cn(
                'flex shrink-0 items-center gap-1.5 border-b border-line bg-base-1 p-2 transition-[background-color,border-color] duration-(--duration-base)',
                tinted && 'border-transparent',
                tinted && ringMap[inkOn(tint)]
            )}
        >
            {children}
        </div>
    );
}

/**
 * A button on the toolbar: Back, Forward, Home, the way out.
 *
 * On the wallet's own bar it is a chip, or the muted red of `danger`. Over a site's colour it takes
 * that colour as the bar does, so the header is one piece and not the wallet's chips set down on a
 * colour they were never drawn for: the bar's colour under a thin wash of the bar's ink, and its
 * glyph in that ink whatever its `tone`, since a red is lost on a site that chose a red. The ink is
 * one of two fixed ones and the wash is thin enough to keep the glyph at 3:1 on any colour, so a
 * site picks what the button stands in and never whether it can be seen. Switched off, it fades as
 * a whole.
 */
export function ToolbarButton({
    tone = 'chip',
    icon,
    disabled = false,
    onClick,
    ...place
}: {
    tone?: 'chip' | 'danger';
    icon: ReactNode;
    disabled?: boolean;
    onClick: () => void;
} & Placement) {
    const tint = useTint();

    return (
        <Button
            dim
            variant={tint.length > 0 ? tintMap[inkOn(tint)] : tone}
            size='iconChip'
            disabled={disabled}
            onClick={onClick}
            shrink={false}
            icon={icon}
            {...place}
        />
    );
}
