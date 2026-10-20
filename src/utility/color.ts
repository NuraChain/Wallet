/** The turn is where WCAG luminance is as far from black as from white, so either ink clears 4.5:1 on every colour. */
export const inkOn = (hex: string): 'dark' | 'light' => {
    const channel = (at: number) => {
        const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;

        return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5) > 0.179 ? 'dark' : 'light';
};
