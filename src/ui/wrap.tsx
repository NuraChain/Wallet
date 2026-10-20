import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { placement, splitPlacement, type Placement } from './place';

export function Block(
    props: {
        relative?: boolean;
        fill?: boolean;
        clip?: boolean;
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

export function Rail() {
    return <div className='my-1 w-px flex-1 bg-line' />;
}

const gridMap = {
    emoji: 'grid grid-cols-5 gap-1',
    favorites: 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4',
    recent: 'grid grid-cols-2 gap-2 lg:grid-cols-4'
} as const;

export function Grid({ look, children }: { look: keyof typeof gridMap; children: ReactNode }) {
    return <div className={gridMap[look]}>{children}</div>;
}
