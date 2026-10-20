import type { ReactNode } from 'react';

import Button from './button';

export function TabBar({ children }: { children: ReactNode }) {
    return (
        <div role='tablist' className='flex items-center border-b border-line'>
            {children}
        </div>
    );
}

export function Tab({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
    return (
        <Button variant={selected ? 'tabOn' : 'tab'} role='tab' onClick={onSelect}>
            {label}

            {selected && <span className='absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-txt-accent' />}
        </Button>
    );
}
