import { FiInbox } from 'react-icons/fi';

import Text from './text';
import Spinner from './spinner';

import { cn } from '../../utility/cn';
import { surfacePanel } from './panel';

const iconMap = {
    empty: <FiInbox size={24} className='text-txt-muted' />,
    loading: <Spinner size={24} className='text-txt-muted' />
} as const;

export default function StatusBlock({
    state = 'empty',
    text,
    panel = false,
    className = ''
}: {
    state?: keyof typeof iconMap;
    text: string;
    panel?: boolean;
    className?: string;
}) {
    return (
        <div
            aria-live='polite'
            className={cn('flex flex-col items-center gap-1 text-center', panel ? `${surfacePanel} rounded-surface px-3 py-6` : 'py-10', className)}
        >
            {iconMap[state]}

            <Text variant='bodyMuted' text={text} />
        </div>
    );
}
