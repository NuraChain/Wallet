import type { ReactNode } from 'react';

import Button from './button';

/** A row of underlined tabs, with room at its end for an action that belongs to them. */
export function TabBar({ children }: { children: ReactNode }) {
    return (
        <div role='tablist' className='flex items-center border-b border-line'>
            {children}
        </div>
    );
}

export function Tab({ id, panel, label, selected, onSelect }: { id: string; panel: string; label: string; selected: boolean; onSelect: () => void }) {
    return (
        <Button variant={selected ? 'tabOn' : 'tab'} role='tab' id={id} aria-selected={selected} aria-controls={panel} onClick={onSelect}>
            {label}

            {selected && <span aria-hidden className='absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-txt-accent' />}
        </Button>
    );
}
