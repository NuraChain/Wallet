import type { ReactNode } from 'react';

import { cn } from '../utility/cn';

const toneMap = {
    muted: 'bg-btn-muted text-txt-normal',
    primary: 'bg-btn-primary text-txt-on-primary',
    secondary: 'bg-btn-secondary text-txt-reverse',
    badge: 'border border-badge-line bg-badge text-badge-text'
} as const;

const sizeMap = { 5: 'size-5', 7: 'size-7', 8: 'size-8', 9: 'size-9' } as const;

// The size of a letter or emoji standing in for an icon.
const glyphMap = { tiny: 'text-tiny', small: 'text-small', medium: 'text-medium' } as const;

export default function IconBox({
    tone = 'muted',
    size = 8,
    glyph,
    children
}: {
    tone?: keyof typeof toneMap;
    size?: keyof typeof sizeMap;
    glyph?: keyof typeof glyphMap;
    children: ReactNode;
}) {
    return (
        <div className={cn('flex shrink-0 items-center justify-center rounded-control', toneMap[tone], sizeMap[size], glyph !== undefined && glyphMap[glyph])}>
            {children}
        </div>
    );
}
