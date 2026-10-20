import type { Transition } from 'motion/react';

export const ease = {
    out: [0.23, 1, 0.32, 1],
    soft: [0.215, 0.61, 0.355, 1],
    away: [0.33, 0.17, 0.67, 0.5]
} as const;

export const spring = {
    dialog: { type: 'spring', stiffness: 150, damping: 25 },
    entrance: { type: 'spring', stiffness: 200, damping: 20 }
} as const satisfies Record<string, Transition>;

export const transition = {
    dialogFade: { duration: 0.4, ease: ease.soft },
    overlay: { duration: 0.4, ease: ease.soft },
    sheet: { duration: 0.4, ease: ease.soft },
    dismiss: { duration: 0.2, ease: ease.away },
    swap: { duration: 0.15, ease: ease.out },
    reveal: { duration: 0.3, ease: ease.out },
    fade: { duration: 0.2, ease: ease.out },
    wait: { duration: 1.1, ease: ease.out },
    instant: { duration: 0 }
} as const satisfies Record<string, Transition>;

export const scale = {
    dialog: 0.8,
    icon: 0.5
} as const;

export const blur = {
    icon: 'blur(2px)',
    surface: 'blur(4px)'
} as const;
