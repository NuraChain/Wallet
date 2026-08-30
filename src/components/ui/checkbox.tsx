import type { ReactNode } from 'react';

import { FiCheck } from 'react-icons/fi';

import Text from './text';

import { cn } from '../../utility/cn';
import { fieldSurface } from './field';

export default function Checkbox({ checked, text, onToggle, children }: { checked: boolean; text?: string; onToggle: () => void; children?: ReactNode }) {
    return (
        <label className='flex min-h-10 cursor-pointer items-center gap-2 py-1'>
            <button
                type='button'
                role='checkbox'
                aria-checked={checked}
                onClick={onToggle}
                className={cn(fieldSurface, 'flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-btn-muted-hover')}
            >
                {checked && <FiCheck size={16} className='text-txt-muted' />}
            </button>

            <Text className='leading-snug' text={text}>
                {children}
            </Text>
        </label>
    );
}
