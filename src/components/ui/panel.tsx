import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utility/cn';

/**
 * The card material: a hairline and a raised fill, nothing else.
 *
 * This generation of the interface separates surfaces structurally rather than atmospherically: no
 * resting shadow on any card, row or input. `base-2` sits a step lighter than the page and the
 * hairline closes the edge, which is all the separation a flat palette needs — a shadow under every
 * card made the whole page float ambiguously and cost a paint-heavy property on every surface for a
 * cue the fill step already carried.
 *
 * Elevation is reserved for what actually floats: dialogs and sheets wear `shadow-float`, and
 * nothing else in the app casts one.
 *
 * Exported as a string as well as a component because the surfaces that wear it are not all plain
 * divs: the modal, the sheet and the nav bar are `motion` elements, a transaction row is a `Button`,
 * and a token row composes it conditionally. It is the material only — the radius and the padding
 * belong to `Panel` below, so a call site that wears the material on something that is not a card
 * does not inherit a card's box.
 */
export const surfacePanel = 'border border-line bg-base-2';

/**
 * Panel - A card.
 *
 * The plain-`div` form of the recipe above, and the one place a card's box is described. Both
 * defaults are ordinary utilities, so `cn` lets a call site that genuinely wants a different box say
 * so and win.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes; conflicting utilities override the recipe's.
 * @param {ReactNode} props.children The card content.
 * @returns {JSX.Element} The card.
 */
export default function Panel({
    className = '',
    children,
    ...rest
}: { className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
    return (
        <div className={cn(surfacePanel, 'rounded-surface p-4', className)} {...rest}>
            {children}
        </div>
    );
}
