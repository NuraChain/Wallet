import type { ReactNode } from 'react';

import Button from './button';

/**
 * The dashboard's bottom bar: a pill of tabs with one round action beside it.
 * It sits in the flow under the pages rather than over them, because a browser tab is a native view that no overlay reaches;
 * so it also owns the bottom inset the pages above it would otherwise pad for.
 */
export function NavBar({ action, children }: { action?: ReactNode; children: ReactNode }) {
    return (
        <div className='flex shrink-0 items-center justify-center gap-3 px-4 pt-2 pb-[calc(0.75rem+var(--inset-bottom))]'>
            <div role='tablist' className='flex h-16 max-w-sm min-w-0 flex-1 items-center gap-1 rounded-full border border-line bg-base-2 p-1.5'>
                {children}
            </div>

            {action}
        </div>
    );
}

export function NavTab({ label, icon, selected, onSelect }: { label: string; icon: ReactNode; selected: boolean; onSelect: () => void }) {
    return <Button variant={selected ? 'navOn' : 'nav'} size='nav' role='tab' title={label} onClick={onSelect} icon={icon} />;
}

export function NavAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
    return <Button variant='chip' size='navAction' title={label} onClick={onClick} icon={icon} />;
}
