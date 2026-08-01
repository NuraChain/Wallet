import type { ReactNode } from 'react';

import Text from './text';

/**
 * SectionHeader - Muted section title with a trailing control.
 *
 * The `justify-between` row that heads the wallet tab's lists: a muted caption on one side, whatever
 * small action the section offers on the other.
 * @param {object} props Component props.
 * @param {string} props.title The section label.
 * @param {ReactNode} [props.children] Trailing control (a small button), if the section has one.
 * @returns {JSX.Element} The header row.
 */
export default function SectionHeader({ title, children }: { title: string; children?: ReactNode })
{
    return (
        <div className='flex items-center justify-between gap-2'>

            <Text text={ title } />

            { children }

        </div>
    );
}
