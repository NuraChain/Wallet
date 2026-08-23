import { FiInbox } from 'react-icons/fi';

import Text from './text';

import { cn } from '../../utility/cn';
import { surfacePanel } from './panel';

/**
 * EmptyState - Inbox icon over a muted line, for a list with nothing in it.
 *
 * `panel` wraps it in the glass card the wallet tab uses; without it the block floats on the page the
 * way the history overview draws it.
 * @param {object} props Component props.
 * @param {string} props.text The muted message.
 * @param {boolean} [props.panel] Wraps the block in a glass panel.
 * @param {string} [props.className] Extra classes for the block.
 * @returns {JSX.Element} The empty state.
 */
export default function EmptyState({ text, panel = false, className = '' }: { text: string; panel?: boolean; className?: string })
{
    return (
        <div className={ cn('flex flex-col items-center gap-1 text-center', panel ? `${ surfacePanel } rounded-surface px-3 py-6` : 'py-10', className) }>

            <FiInbox size={ 24 } className='text-txt-muted' />

            <Text variant='bodyMuted' text={ text } />

        </div>
    );
}
