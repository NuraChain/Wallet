import type { Transition } from 'motion/react';

export const ease = {
    out: [0.23, 1, 0.32, 1],
    soft: [0.215, 0.61, 0.355, 1],
    away: [0.33, 0.17, 0.67, 0.5]
} as const;

// The same steps as the `--duration-*` scale in style.css, so a CSS and a motion transition of one kind run alike.
export const duration = {
    fast: 0.15,
    base: 0.2,
    surface: 0.3
} as const;

export const spring = {
    // Near critically damped: a surface settles in about a third of a second without overshooting.
    surface: { type: 'spring', stiffness: 400, damping: 34 }
} as const satisfies Record<string, Transition>;

export const transition = {
    overlay: { duration: duration.surface, ease: ease.soft },
    sheet: { duration: duration.surface, ease: ease.soft },
    dismiss: { duration: duration.base, ease: ease.away },
    swap: { duration: duration.fast, ease: ease.out },
    reveal: { duration: duration.surface, ease: ease.out },
    fade: { duration: duration.base, ease: ease.out },
    wait: { duration: 1.1, ease: ease.out },
    instant: { duration: 0 }
} as const satisfies Record<string, Transition>;

export const scale = {
    dialog: 0.96,
    icon: 0.5
} as const;

export const blur = {
    icon: 'blur(2px)'
} as const;
