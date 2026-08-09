import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utility/cn';

/**
 * The frosted card, as Tailwind utilities.
 *
 * This was a hand-written `.glass-panel` CSS class. Every declaration in it had a utility equivalent,
 * so it lives here as a class string instead: the same styling, in the same vocabulary as the call
 * sites around it, and — being ordinary utilities now — overridable through `cn` rather than winning
 * silently on cascade order.
 *
 * Exported as a string as well as a component because the surfaces that wear it are not all plain
 * divs: the modal, the sheet and the nav bar are `motion` elements, a transaction row is a `Button`,
 * and a token row composes it conditionally.
 *
 * Blur radius and shadow spread are the two dominant per-frame GPU costs here: a `backdrop-filter`
 * forces the compositor to re-read and re-blur everything behind the element every time any pixel
 * under it moves. With ~20 of these on screen a mid-range GPU cannot hold a frame budget, so the
 * radius is the smallest value that still reads as glass.
 *
 * `ease-initial` is deliberate. Tailwind's `transition-*` utilities apply their own easing curve,
 * while the CSS this replaces never set one and so used the initial `ease` — this pins that.
 */
export const glassPanel = 'border border-glass-line bg-base-2 shadow-[0_8px_24px_var(--glass-shadow)] backdrop-blur-[12px] backdrop-saturate-[150%] transition-[background-color,border-color] duration-300 ease-initial';

/**
 * Panel - A glass card.
 *
 * The plain-`div` form of the recipe above, for the surfaces that need nothing but the card itself.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes; conflicting utilities override the recipe's.
 * @param {ReactNode} props.children The card content.
 * @returns {JSX.Element} The card.
 */
export default function Panel({ className = '', children, ...rest }: { className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>)
{
    return (
        <div className={ cn(glassPanel, className) } { ...rest }>

            { children }

        </div>
    );
}
