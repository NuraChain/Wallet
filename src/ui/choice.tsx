import type { ReactNode } from 'react';

import { cn } from '../utility/cn';
import { selectedTint } from './token';

/** A row in a list of choices, tinted when it is the one in effect; its own controls sit inside it. */
export default function ChoiceRow({ selected, children }: { selected: boolean; children: ReactNode }) {
    return (
        <div
            className={cn(
                'flex items-center gap-2 rounded-surface border border-transparent p-2 transition-colors duration-(--duration-fast)',
                selected ? selectedTint : 'hover:bg-btn-muted-hover'
            )}
        >
            {children}
        </div>
    );
}
