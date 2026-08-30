import type { ReactNode } from 'react';

import Text from './text';
import Button from './button';

import { cn } from '../../utility/cn';

export const selectedTint = 'border-btn-primary-border bg-btn-primary/15';

export default function MenuRow({
    leading,
    label,
    trailing,
    selected = false,
    className = '',
    onClick
}: {
    leading?: ReactNode;
    label: string;
    trailing?: ReactNode;
    selected?: boolean;
    className?: string;
    onClick: () => void;
}) {
    return (
        <Button
            variant='muted'
            aria-current={selected || undefined}
            onClick={onClick}
            className={cn('h-12 gap-3 rounded-surface px-3', selected && `${selectedTint} cursor-default`, className)}
        >
            {leading}

            <Text variant='body' className='min-w-0 flex-1 truncate text-start' text={label} />

            {trailing}
        </Button>
    );
}
