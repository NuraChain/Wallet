import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utility/cn';

/**
 * Horizontal - A row.
 *
 * The flex container written out by hand in about sixty places, named once. It carries `flex` and
 * nothing else: a row is what `flex-direction` already defaults to, so spelling `flex-row` would add a
 * declaration the browser was making anyway and give call sites a second thing to keep in step.
 *
 * Everything that varies — alignment, gaps, padding, width, the surface it sits on — rides in through
 * `className`, exactly as it did on the `div` this replaces. `cn` lets those win over the `flex`, so a
 * call site that genuinely needs a column can still pass `flex-col` and get one.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes; conflicting utilities override the recipe's.
 * @param {ReactNode} props.children The row content.
 * @returns {JSX.Element} The row.
 */
export function Horizontal({
    className = '',
    children,
    ...rest
}: { className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
    return (
        <div className={cn('flex', className)} {...rest}>
            {children}
        </div>
    );
}

/**
 * Vertical - A column.
 *
 * The same idea as `Horizontal` with the direction stated, since that one is not the default. Both
 * render a plain `div`, so nothing about the DOM, the cascade or the writing direction changes by
 * moving to them — `flex` and `flex-col` are the only classes either one contributes, and they are the
 * two the call site is no longer writing.
 *
 * Note that `cn` deliberately does not group `flex` with `flex-col`: they are a display and a
 * direction, not two spellings of one property, so both survive the merge and a `className` cannot
 * knock the display out from under the direction.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes; conflicting utilities override the recipe's.
 * @param {ReactNode} props.children The column content.
 * @returns {JSX.Element} The column.
 */
export function Vertical({
    className = '',
    children,
    ...rest
}: { className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
    return (
        <div className={cn('flex flex-col', className)} {...rest}>
            {children}
        </div>
    );
}
