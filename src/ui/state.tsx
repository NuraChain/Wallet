import { Inbox } from 'lucide-react';

import Text from './text';
import Spinner from './spinner';

import { cn } from '../utility/cn';
import { surfacePanel } from './panel';

const iconMap = {
    empty: <Inbox size={24} className='text-txt-muted' />,
    loading: <Spinner size={24} muted />
} as const;

export default function StatusBlock({
    state = 'empty',
    text,
    panel = false,
    fill = false,
    px
}: {
    state?: keyof typeof iconMap;
    text: string;
    panel?: boolean;
    /** Takes the whole height it is given and centres itself in it. */
    fill?: boolean;
    px?: 5;
}) {
    return (
        <div
            aria-live='polite'
            className={cn(
                'flex flex-col items-center gap-1 text-center',
                panel ? `${surfacePanel} rounded-surface px-3 py-6` : 'py-10',
                fill && 'min-h-full justify-center',
                px === 5 && 'px-5'
            )}
        >
            {iconMap[state]}

            <Text variant='bodyMuted' text={text} />
        </div>
    );
}
