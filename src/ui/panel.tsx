import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { placement, splitPlacement, type Placement } from './place';

export const surfacePanel = 'border border-line bg-base-2';

const flowMap = { row: 'flex', column: 'flex flex-col' } as const;

export default function Panel(
    props: {
        /** Lays its children out as a row or a column instead of stacking them as blocks. */
        flow?: keyof typeof flowMap;
        gap?: 2 | 3;
        align?: 'center';
        textAlign?: 'center';
        /** Holds a long body to a short scrolling box. */
        bounded?: boolean;
        children: ReactNode;
    } & Placement &
        Omit<ComponentPropsWithRef<'div'>, 'className' | 'children'>
) {
    const [place, { flow, gap, align, textAlign, bounded = false, children, ...rest }] = splitPlacement(props);

    return (
        <div
            className={cn(
                surfacePanel,
                'rounded-surface p-4',
                flow !== undefined && flowMap[flow],
                align === 'center' && 'items-center',
                gap === 2 && 'gap-2',
                gap === 3 && 'gap-3',
                textAlign === 'center' && 'text-center',
                bounded && 'max-h-48 overflow-y-auto overscroll-contain',
                placement(place)
            )}
            {...rest}
        >
            {children}
        </div>
    );
}
