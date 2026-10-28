export type MouseIcon = 'logo' | 'browser';

/** The icons the mouse's menu can wear; each platform draws its own copy of every one. */
export type MouseGlyph = 'wallet' | 'browser' | 'full' | 'exit';

/** One button of the mouse's menu, plain enough to hand to a native one. */
export interface MouseMenuItem {
    key: string;
    label: string;
    glyph: MouseGlyph;
    disabled: boolean;
}

/** The theme's colours as `#rrggbb`, for a menu drawn where the wallet's stylesheet does not reach. */
export interface MouseMenuColors {
    surface: string;
    line: string;
    ink: string;
    accent: string;
    onAccent: string;
    muted: string;
}

/** A spot in the wallet's page, in CSS pixels. */
export interface Point {
    x: number;
    y: number;
}

export type LanguageType = 'en' | 'fa' | 'ar' | 'es' | 'pt' | 'hi' | 'zh' | 'ru' | 'fr' | 'tr';
