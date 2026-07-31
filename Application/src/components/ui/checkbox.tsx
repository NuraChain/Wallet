import type { ReactNode } from 'react';

import { FiCheck } from 'react-icons/fi';

/**
 * Checkbox - The glass agreement checkbox with its inline label.
 *
 * Not a native `<input type='checkbox'>`: the square is a button styled as a glass tile so it matches
 * the inputs around it, exactly as the intro screens drew it twice by hand.
 * @param {object} props Component props.
 * @param {boolean} props.checked Whether the box is ticked.
 * @param {() => void} props.onToggle Flips the state.
 * @param {ReactNode} props.children The label text beside the box.
 * @returns {JSX.Element} The checkbox row.
 */
export default function Checkbox({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: ReactNode })
{
    return (
        <label className='flex min-h-10 cursor-pointer items-center gap-2 py-1'>

            <button
                type='button'
                onClick={ onToggle }
                className='glass-input flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm'>

                {
                    checked && <FiCheck size={ 16 } className='text-txt-muted' />
                }

            </button>

            <div className='text-tiny/snug text-txt-muted'>

                { children }

            </div>

        </label>
    );
}
