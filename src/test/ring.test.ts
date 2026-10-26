import { describe, expect, it } from 'vitest';

import { ringLabel, ringSlice } from '../utility/ring';

const ring = { box: 200, inner: 50, outer: 100, gap: 4, corner: 0 };

// An arc's radii and flags are not points; only where it ends is.
const points = (path: string) =>
    [...path.replaceAll(/A [\d.]+ [\d.]+ 0 [01] [01]/gu, 'A').matchAll(/(?<x>-?[\d.]+) (?<y>-?[\d.]+)/gu)].map((match) => ({
        x: Number(match.groups?.x),
        y: Number(match.groups?.y)
    }));

const radius = ({ x, y }: { x: number; y: number }) => Math.hypot(x - 100, y - 100);

describe('ringSlice', () => {
    it('keeps every point between the inner and outer edge', () => {
        for (const point of points(ringSlice(1, 3, ring))) {
            expect(radius(point)).toBeGreaterThan(49.9);
            expect(radius(point)).toBeLessThan(100.1);
        }
    });

    it('leaves a gap of even width between two slices', () => {
        // Two slices meet across the middle: the top one above, the bottom one below.
        const top = points(ringSlice(0, 2, ring));
        const bottom = points(ringSlice(1, 2, ring));

        expect(Math.min(...bottom.map((point) => point.y)) - Math.max(...top.map((point) => point.y))).toBeCloseTo(4, 1);
    });

    it('rounds its corners inside the slice', () => {
        const rounded = ringSlice(0, 3, { ...ring, corner: 6 });

        expect(rounded.match(/Q /gu)).toHaveLength(4);

        for (const point of points(rounded)) {
            expect(radius(point)).toBeLessThan(100.1);
        }
    });
});

describe('ringLabel', () => {
    it('puts the first label straight up, halfway across the ring', () => {
        expect(ringLabel(0, 3, ring)).toEqual({ x: 100, y: 25 });
    });
});
