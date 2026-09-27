import type { ReactNode } from 'react';

import Text from './text';
import Button from './button';

import type { Placement } from './place';

export default function MenuRow({
    leading,
    label,
    trailing,
    selected = false,
    variant = 'muted',
    onClick,
    ...place
}: {
    leading?: ReactNode;
    label: string;
    trailing?: ReactNode;
    selected?: boolean;
    variant?: 'muted' | 'primary';
    onClick: () => void;
} & Placement) {
    return (
        <Button variant={variant} size='menu' selected={selected} aria-current={selected || undefined} onClick={onClick} {...place}>
            {leading}

            <Text variant='body' squeeze='x' grow truncate align='start' tone={variant === 'primary' ? 'onPrimary' : undefined} text={label} />

            {trailing}
        </Button>
    );
}
