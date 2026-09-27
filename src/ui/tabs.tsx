import type { ReactNode } from 'react';

import Button from './button';

import { cn } from '../utility/cn';
import { selectedTint } from './token';

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

/** One tab in the browser's tab list: its name to switch to it, and a way to close it. */
export function TabChip({ active, children }: { active: boolean; children: ReactNode }) {
    return (
        <div
            className={cn(
                'flex h-9 w-full items-center gap-1 rounded-surface border ps-3 pe-1 transition-[background-color,border-color] duration-(--duration-fast) ease-initial',
                active ? selectedTint : 'border-line bg-base-3 hover:bg-base-2'
            )}
        >
            {children}
        </div>
    );
}
