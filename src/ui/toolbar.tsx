import type { ReactNode } from 'react';

import { cn } from '../utility/cn';
import { inkOn } from '../utility/color';
import { useTint } from '../hook/tint';

/* Over a site's colour, the focus ring of everything on the bar is the bar's own ink. The wallet's
   ring is a blue a site may well have chosen for itself, and a ring drawn in the colour under it
   is no ring. */
const ringMap = { dark: '[--focus-ring:var(--tint-dark)]', light: '[--focus-ring:var(--tint-light)]' } as const;

/**
 * The strip of controls across the top of the browser: its address bar, and its tab list.
 *
 * Over a page it wears the colour that page asks for, with the title bar and the status bar above
 * it, so the three read as one. That is the bar and nothing on it: the address field, with the
 * lock or the warning in it, and the buttons either side stay the wallet's own opaque surfaces in
 * the wallet's own ink. They are what tells the user where they are, and a site does not get to
 * restyle that or to wash it out. The colour is the site's and known only at runtime, which is why
 * it is a style here and not a class.
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
