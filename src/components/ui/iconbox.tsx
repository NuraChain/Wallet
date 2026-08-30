import type { ReactNode } from 'react';

import { cn } from '../../utility/cn';
import { Horizontal } from './stack';

const toneMap = {
    muted: 'bg-btn-muted text-txt-normal',
    primary: 'bg-btn-primary text-txt-on-primary',
    secondary: 'bg-btn-secondary text-txt-reverse',
    badge: 'border border-badge-line bg-badge text-badge-text'
} as const;

export default function IconBox({ tone = 'muted', className = 'size-8', children }: { tone?: keyof typeof toneMap; className?: string; children: ReactNode }) {
    return <Horizontal className={cn('shrink-0 items-center justify-center rounded-control', toneMap[tone], className)}>{children}</Horizontal>;
}
