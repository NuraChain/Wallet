import type { ReactNode } from 'react';

import Button from './button';

import { cn } from '../utility/cn';
import { inkOn } from '../utility/color';
import { useTint } from '../hook/tint';

import type { Placement } from './place';

const ringMap = { dark: '[--focus-ring:var(--tint-dark)]', light: '[--focus-ring:var(--tint-light)]' } as const;

const tintMap = { dark: 'tintDark', light: 'tintLight' } as const;

// The address field is never tinted: a site must not restyle what tells the user where they are.
export default function Toolbar({ children }: { children: ReactNode }) {
    const tint = useTint();

    const tinted = tint.length > 0;

    return (
        <div
            style={tinted ? { backgroundColor: tint } : undefined}
            className={cn(
                'flex shrink-0 items-center gap-2 border-b border-line bg-base-1 p-2 transition-[background-color,border-color] duration-(--duration-base)',
                tinted && 'border-transparent',
                tinted && ringMap[inkOn(tint)]
            )}
        >
            {children}
        </div>
    );
}

export function ToolbarButton({
    tone = 'chip',
    icon,
    disabled = false,
    onClick,
    ...place
}: {
    tone?: 'chip' | 'danger';
    icon: ReactNode;
    disabled?: boolean;
    onClick: () => void;
} & Placement) {
    const tint = useTint();

    return (
        <Button
            dim
            variant={tint.length > 0 ? tintMap[inkOn(tint)] : tone}
            size='iconChip'
            disabled={disabled}
            onClick={onClick}
            shrink={false}
            icon={icon}
            {...place}
        />
    );
}
