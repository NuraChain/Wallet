/**
 * Which ink reads on a colour somebody else chose: `dark` on a light one, `light` on a dark one.
 *
 * The turn comes where the colour's luminance, as WCAG measures it, is as far from black as it is
 * from white. There the contrast with either is 4.58:1, so pure black or pure white clears 4.5:1
 * on every colour there is; an ink any softer than those would not.
 */
export const inkOn = (hex: string): 'dark' | 'light' => {
    const channel = (at: number) => {
        const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;

        return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5) > 0.179 ? 'dark' : 'light';
};
