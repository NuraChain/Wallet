import type { ReactNode } from 'react';

/** The strip of controls across the top of the browser: its address bar, and its tab list. */
export default function Toolbar({ children }: { children: ReactNode }) {
    return <div className='flex shrink-0 items-center gap-1.5 border-b border-line bg-base-1 p-2'>{children}</div>;
}
