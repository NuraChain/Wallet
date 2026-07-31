import type { ReactNode } from 'react';

import { FiInbox } from 'react-icons/fi';

import { cn } from '../../utility/cn';

/**
 * EmptyState - Inbox icon over a muted line, for a list with nothing in it.
 *
 * `panel` wraps it in the glass card the wallet tab uses; without it the block floats on the page the
 * way the history overview draws it.
 * @param {object} props Component props.
 * @param {ReactNode} [props.icon] Replacement icon, when the inbox does not fit the list.
 * @param {boolean} [props.panel] Wraps the block in a glass panel.
 * @param {string} [props.className] Extra classes for the block.
 * @param {ReactNode} props.children The muted message.
 * @returns {JSX.Element} The empty state.
 */
export default function EmptyState({ icon, panel = false, className = '', children }: { icon?: ReactNode; panel?: boolean; className?: string; children: ReactNode })
{
    return (
        <div className={ cn('flex flex-col items-center gap-1 text-center', panel ? 'glass-panel rounded-xl px-3 py-6' : 'py-10', className) }>

            {
                icon ?? <FiInbox size={ 24 } className='text-txt-muted' />
            }

            <div className='text-small text-txt-muted'>

                { children }

            </div>

        </div>
    );
}
