import { cn } from '../utility/cn';

/**
 * How a primitive sits in its parent — what a caller used to say with a `className`. Every
 * primitive takes the same set, so a row reads the same whichever component it lays out.
 *
 * Each value maps to one class written out in full below: Tailwind only generates what it finds
 * in source, so nothing here may assemble a class name at runtime.
 */
export interface Placement {
    /** Takes the free space along the parent's axis. */
    grow?: boolean;
    /** `false` holds its size when the parent runs short; `true` lets it give way. */
    shrink?: boolean;
    /** May shrink below its content: `x` in a row, `y` in a column. */
    squeeze?: 'x' | 'y';
    mt?: keyof typeof mtMap;
    mb?: keyof typeof mbMap;
    ms?: 'auto';
    mx?: 'auto';
    self?: 'end';
    /** With the sidebar layout at `lg`: hidden there, or shown only there. */
    wide?: 'hide' | 'only';
    width?: keyof typeof widthMap;
}

const mtMap = { 0: 'mt-0', 1: 'mt-1', 2: 'mt-2', 3: 'mt-3', 4: 'mt-4', auto: 'mt-auto' } as const;

const mbMap = { 1: 'mb-1', 2: 'mb-2' } as const;

const widthMap = { full: 'w-full', fit: 'w-fit', 20: 'w-20', 24: 'w-24' } as const;

const placementKeys = ['grow', 'shrink', 'squeeze', 'mt', 'mb', 'ms', 'mx', 'self', 'wide', 'width'] as const satisfies readonly (keyof Placement)[];

/** The classes for a placement. Text is shown again at `lg` as a text box, a stack as a flex one. */
export const placement = ({ grow, shrink, squeeze, mt, mb, ms, mx, self, wide, width }: Placement, text = false) =>
    cn(
        grow && 'flex-1',
        shrink === false && 'shrink-0',
        shrink === true && 'shrink',
        squeeze === 'x' && 'min-w-0',
        squeeze === 'y' && 'min-h-0',
        mt !== undefined && mtMap[mt],
        mb !== undefined && mbMap[mb],
        ms === 'auto' && 'ms-auto',
        mx === 'auto' && 'mx-auto',
        self === 'end' && 'self-end',
        wide === 'hide' && 'lg:hidden',
        wide === 'only' && (text ? 'hidden lg:block' : 'hidden lg:flex'),
        width !== undefined && widthMap[width]
    );

/** Separates the placement props from the ones meant for the element itself. */
export const splitPlacement = <T extends Placement>(props: T): [Placement, Omit<T, keyof Placement>] => {
    const placed = new Set<string>(placementKeys);
    const entries = Object.entries(props);

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const place = Object.fromEntries(entries.filter(([key]) => placed.has(key))) as Placement;
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const rest = Object.fromEntries(entries.filter(([key]) => !placed.has(key))) as Omit<T, keyof Placement>;

    return [place, rest];
};
