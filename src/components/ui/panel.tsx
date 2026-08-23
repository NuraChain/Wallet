import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utility/cn';

/**
 * The card material: a hairline, a raised fill, and the faintest lift off the page.
 *
 * This used to be frosted — a translucent fill over a `backdrop-filter`, floating on a field of
 * radial-gradient orbs. The surface is opaque now, so the separation comes from three cheap things
 * instead of one expensive one: `base-2` sits a step lighter than the page in both themes, the
 * hairline closes the edge, and `shadow-rest` is a hint rather than the mechanism.
 *
 * That is also why the blur is not simply tokenised and kept. The backdrop it was reading was three
 * gradients 500px across; a 12px Gaussian over features that size produces the same pixels it started
 * with, so on every card, row and input it was a no-op the compositor still had to pay for on each
 * frame of every scroll.
 *
 * Exported as a string as well as a component because the surfaces that wear it are not all plain
 * divs: the modal, the sheet and the nav bar are `motion` elements, a transaction row is a `Button`,
 * and a token row composes it conditionally. It is the material only — the radius and the padding
 * belong to `Panel` below, so a call site that wears the material on something that is not a card
 * does not inherit a card's box.
 *
 * `ease-initial` is deliberate. Tailwind's `transition-*` utilities apply their own easing curve,
 * while the CSS this replaces never set one and so used the initial `ease` — this pins that.
 */
export const surfacePanel = 'border border-line bg-base-2 shadow-rest transition-[background-color,border-color] duration-(--duration-surface) ease-initial';

/**
 * Panel - A card.
 *
 * The plain-`div` form of the recipe above, and the one place a card's box is described. Five call
 * sites were re-deriving the radius and the padding alongside the material, which is exactly why
 * they had drifted — one dialog restated the same radius and padding four times in a single file,
 * and the offline notice ended up the only 16px card in a column of 12px ones.
 *
 * Both defaults are ordinary utilities, so `cn` lets a call site that genuinely wants a different
 * box say so and win.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes; conflicting utilities override the recipe's.
 * @param {ReactNode} props.children The card content.
 * @returns {JSX.Element} The card.
 */
export default function Panel({ className = '', children, ...rest }: { className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>)
{
    return (
        <div className={ cn(surfacePanel, 'rounded-surface p-3', className) } { ...rest }>

            { children }

        </div>
    );
}
