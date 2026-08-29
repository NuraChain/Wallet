import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utility/cn';
import { surfacePanel } from './panel';

/**
 * ListCard - A group of rows on one shared surface, separated by hairlines.
 *
 * One card around a list, rather than a card around every row: the holdings list, the transaction
 * lists and the token manager are columns of homogeneous rows, and wrapping each row in its own
 * panel turned them into stacks of boxes — heavy, and noisy at exactly the densities where scanning
 * matters. Grouped, the container carries the surface and the radius once; the rows inside stay
 * plain and carry nothing but their content, with `list-divide` drawing the rhythm between them.
 *
 * Rows are passed as direct children. Anything that is not a row (an empty state, an action button)
 * sits outside the group, because a divider into whitespace is a lie about structure.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes; conflicting utilities override the defaults.
 * @param {ReactNode} props.children The rows.
 * @returns {JSX.Element} The grouped list.
 */
export default function ListCard({
    className = '',
    children,
    ...rest
}: { className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
    return (
        <div className={cn(surfacePanel, 'overflow-hidden rounded-surface list-divide', className)} {...rest}>
            {children}
        </div>
    );
}
