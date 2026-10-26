interface Point {
    x: number;
    y: number;
}

interface Ring {
    /** The side of the square box the ring is drawn in; its centre is the ring's. */
    box: number;
    inner: number;
    outer: number;
    /** The width of the gap between two slices, the same from the inner edge to the outer. */
    gap: number;
    corner: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

const pair = ({ x, y }: Point) => `${round(x)} ${round(y)}`;

const toward = (from: Point, to: Point, distance: number): Point => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);

    return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
};

// Slice `index` of `count` spans these angles: the first is centred straight up, the rest follow clockwise.
const span = (index: number, count: number) => {
    const step = (Math.PI * 2) / count;
    const middle = -Math.PI / 2 + index * step;

    return { start: middle - step / 2, middle, end: middle + step / 2 };
};

/** Where slice `index` of `count` is, as an SVG path in the ring's box: its corners rounded, and half a gap cut from either side. */
export const ringSlice = (index: number, count: number, ring: Ring) => {
    const { box, inner, outer, gap, corner } = ring;

    const centre = box / 2;
    const { start, end } = span(index, count);

    const at = (radius: number, angle: number): Point => ({ x: centre + radius * Math.cos(angle), y: centre + radius * Math.sin(angle) });

    // The same gap is a wider angle near the middle, which is what keeps its two sides parallel.
    const outerCut = Math.asin(gap / 2 / outer);
    const innerCut = Math.asin(gap / 2 / inner);

    const outerStart = at(outer, start + outerCut);
    const outerEnd = at(outer, end - outerCut);
    const innerEnd = at(inner, end - innerCut);
    const innerStart = at(inner, start + innerCut);

    const outerSweep = end - start - 2 * outerCut - (2 * corner) / outer;
    const innerSweep = end - start - 2 * innerCut - (2 * corner) / inner;

    return [
        `M ${pair(toward(outerStart, innerStart, corner))}`,
        `Q ${pair(outerStart)} ${pair(at(outer, start + outerCut + corner / outer))}`,
        `A ${outer} ${outer} 0 ${outerSweep > Math.PI ? 1 : 0} 1 ${pair(at(outer, end - outerCut - corner / outer))}`,
        `Q ${pair(outerEnd)} ${pair(toward(outerEnd, innerEnd, corner))}`,
        `L ${pair(toward(innerEnd, outerEnd, corner))}`,
        `Q ${pair(innerEnd)} ${pair(at(inner, end - innerCut - corner / inner))}`,
        `A ${inner} ${inner} 0 ${innerSweep > Math.PI ? 1 : 0} 0 ${pair(at(inner, start + innerCut + corner / inner))}`,
        `Q ${pair(innerStart)} ${pair(toward(innerStart, outerStart, corner))}`,
        'Z'
    ].join(' ');
};

/** The middle of slice `index` of `count`, where its label goes. */
export const ringLabel = (index: number, count: number, ring: Ring): Point => {
    const { middle } = span(index, count);

    const radius = (ring.inner + ring.outer) / 2;

    return { x: round(ring.box / 2 + radius * Math.cos(middle)), y: round(ring.box / 2 + radius * Math.sin(middle)) };
};
