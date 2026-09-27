import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { placement, splitPlacement, type Placement } from './place';

const gapMap = { 0.5: 'gap-0.5', 1: 'gap-1', 1.5: 'gap-1.5', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4' } as const;

const alignMap = { center: 'items-center', end: 'items-end', baseline: 'items-baseline' } as const;

const justifyMap = { center: 'justify-center', between: 'justify-between' } as const;

const pMap = { 2: 'p-2', 3: 'p-3', 4: 'p-4' } as const;
const pxMap = { 1: 'px-1', 2: 'px-2', 3: 'px-3', 5: 'px-5' } as const;
const pyMap = { 2: 'py-2', 4: 'py-4', 5: 'py-5', 6: 'py-6' } as const;
const ptMap = { 5: 'pt-5' } as const;
const pbMap = { 1: 'pb-1', 4: 'pb-4' } as const;

const fillMap = { both: 'size-full', height: 'h-full' } as const;

const scrollMap = { y: 'overflow-y-auto', both: 'overflow-auto' } as const;

export interface StackProps extends Placement {
    gap?: keyof typeof gapMap;
    /** Cross-axis alignment of the children. */
    align?: keyof typeof alignMap;
    /** Main-axis distribution of the children. */
    justify?: keyof typeof justifyMap;
    p?: keyof typeof pMap;
    px?: keyof typeof pxMap;
    py?: keyof typeof pyMap;
    pt?: keyof typeof ptMap;
    pb?: keyof typeof pbMap;
    /** Positions absolutely placed children against itself. */
    relative?: boolean;
    /** Takes its parent's whole box, or its whole height. */
    fill?: keyof typeof fillMap;
    maxWidth?: 'lg';
    scroll?: keyof typeof scrollMap;
    /** Every child takes an equal share of the row. */
    even?: boolean;
    textAlign?: 'start';
    /** Clips what runs past its edge. */
    clip?: boolean;
    children: ReactNode;
}

type StackAttributes = StackProps & Omit<ComponentPropsWithRef<'div'>, 'className' | 'children'>;

const stack = (direction: string, props: StackAttributes) => {
    const [place, { gap, align, justify, p, px, py, pt, pb, relative, fill, maxWidth, scroll, even, textAlign, clip, children, ...rest }] =
        splitPlacement(props);

    return (
        <div
            className={cn(
                direction,
                relative && 'relative',
                fill !== undefined && fillMap[fill],
                maxWidth === 'lg' && 'max-w-lg',
                scroll !== undefined && scrollMap[scroll],
                clip && 'overflow-hidden',
                gap !== undefined && gapMap[gap],
                align !== undefined && alignMap[align],
                justify !== undefined && justifyMap[justify],
                p !== undefined && pMap[p],
                px !== undefined && pxMap[px],
                py !== undefined && pyMap[py],
                pt !== undefined && ptMap[pt],
                pb !== undefined && pbMap[pb],
                even && '*:flex-1',
                textAlign === 'start' && 'text-start',
                placement(place)
            )}
            {...rest}
        >
            {children}
        </div>
    );
};

export function Horizontal(props: StackAttributes) {
    return stack('flex', props);
}

export function Vertical(props: StackAttributes) {
    return stack('flex flex-col', props);
}
