import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { placement, splitPlacement, type Placement } from './place';

/**
 * A plain wrapper with no layout of its own — one that only has to sit in its parent, hold a
 * ref, or carry an ARIA role. Its props stop at what wrappers here need; a box that wants a look is
 * a primitive named for that look, not this with more props.
 */
export function Block(
    props: {
        relative?: boolean;
        fill?: boolean;
        /** Clips what runs past its edge. */
        clip?: boolean;
        /** A fixed height, for a scroll sentinel. */
        height?: 4;
        children?: ReactNode;
    } & Placement &
        Omit<ComponentPropsWithRef<'div'>, 'className' | 'children'>
) {
    const [place, { relative = false, fill = false, clip = false, height, children, ...rest }] = splitPlacement(props);

    const classes = cn(relative && 'relative', fill && 'size-full', clip && 'overflow-hidden', height === 4 && 'h-4', placement(place));

    return (
        <div className={classes.length > 0 ? classes : undefined} {...rest}>
            {children}
        </div>
    );
}

/** The line joining one stop of a request's route to the next. */
export function Rail() {
    return <div className='my-1 w-px flex-1 bg-line' />;
}

const gridMap = {
    /** The account icon picker. */
    emoji: 'grid grid-cols-5 gap-1',
    /** The browser's favourite cards, more of them as the window widens. */
    favorites: 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4',
    /** The browser's recently visited sites. */
    recent: 'grid grid-cols-2 gap-2 lg:grid-cols-4',
    /** The browser's open tabs, two cards across on a phone as its own tab overview has them. */
    tabs: 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'
} as const;

export function Grid({ look, children }: { look: keyof typeof gridMap; children: ReactNode }) {
    return <div className={gridMap[look]}>{children}</div>;
}
