import { cn } from '../utility/cn';

/** Every class is written out in full: Tailwind only generates classes it finds in source. */
export interface Placement {
    grow?: boolean;
    shrink?: boolean;
    squeeze?: 'x' | 'y';
    mt?: keyof typeof mtMap;
    mb?: keyof typeof mbMap;
    ms?: 'auto';
    mx?: 'auto';
    self?: 'end';
    wide?: 'hide' | 'only';
    width?: keyof typeof widthMap;
}

const mtMap = { 0: 'mt-0', 1: 'mt-1', 2: 'mt-2', 3: 'mt-3', 4: 'mt-4', auto: 'mt-auto' } as const;

const mbMap = { 1: 'mb-1', 2: 'mb-2' } as const;

const widthMap = { full: 'w-full', fit: 'w-fit', 20: 'w-20', 24: 'w-24' } as const;

const placementKeys = ['grow', 'shrink', 'squeeze', 'mt', 'mb', 'ms', 'mx', 'self', 'wide', 'width'] as const satisfies readonly (keyof Placement)[];

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

export const splitPlacement = <T extends Placement>(props: T): [Placement, Omit<T, keyof Placement>] => {
    const placed = new Set<string>(placementKeys);
    const entries = Object.entries(props);

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const place = Object.fromEntries(entries.filter(([key]) => placed.has(key))) as Placement;
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const rest = Object.fromEntries(entries.filter(([key]) => !placed.has(key))) as Omit<T, keyof Placement>;

    return [place, rest];
};
