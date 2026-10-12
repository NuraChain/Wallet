import { describe, expect, it } from 'vitest';

import { inkOn } from '../utility/color';

const luminance = (hex: string) => {
    const channel = (at: number) => {
        const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;

        return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

const contrast = (hex: string) => {
    const under = luminance(hex);

    return inkOn(hex) === 'dark' ? (under + 0.05) / 0.05 : 1.05 / (under + 0.05);
};

describe('the ink set on a colour a site chose', () => {
    it('is dark on a light colour and light on a dark one', () => {
        expect(inkOn('#ffffff')).toBe('dark');
        expect(inkOn('#edf2f8')).toBe('dark');
        expect(inkOn('#ffd600')).toBe('dark');
        expect(inkOn('#000000')).toBe('light');
        expect(inkOn('#0c121a')).toBe('light');
        expect(inkOn('#0d47a1')).toBe('light');
    });

    it('reads at 4.5:1 or better on every grey, and on the colours nearest the turn', () => {
        for (let level = 0; level < 256; level += 1) {
            const pair = level.toString(16).padStart(2, '0');

            expect(contrast(`#${pair}${pair}${pair}`)).toBeGreaterThanOrEqual(4.5);
        }

        for (const hex of ['#757575', '#767676', '#777777', '#ff0000', '#008000', '#0000ff', '#e53935', '#00897b']) {
            expect(contrast(hex)).toBeGreaterThanOrEqual(4.5);
        }
    });
});
