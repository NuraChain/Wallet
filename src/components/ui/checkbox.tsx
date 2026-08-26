import type { ReactNode } from 'react';

import { FiCheck } from 'react-icons/fi';

import Text from './text';

import { cn } from '../../utility/cn';
import { fieldSurface } from './field';

/**
 * Checkbox - The glass agreement checkbox with its inline label.
 *
 * Not a native `<input type='checkbox'>`: the square is a button styled as a glass tile so it matches
 * the inputs around it, exactly as the intro screens drew it twice by hand. It is a button wearing
 * the checkbox role rather than an input wearing a tile, so the state it toggles is what assistive
 * technology announces — "checked" or "not checked" against the label — instead of a nameless press.
 *
 * The label goes in `text` when it is a plain one; `children` stays for a label that composes, such
 * as one carrying a link. Both render in the same slot, so the two forms never combine. The wrapping
 * `<label>` is what makes the whole row the target, and clicking the words reaches the button the
 * same way a tap on the square does.
 * @param {object} props Component props.
 * @param {boolean} props.checked Whether the box is ticked.
 * @param {string} [props.text] The label beside the box, when it is plain text.
 * @param {() => void} props.onToggle Flips the state.
 * @param {ReactNode} [props.children] Composed label, for the cases `text` cannot express.
 * @returns {JSX.Element} The checkbox row.
 */
export default function Checkbox({ checked, text, onToggle, children }: { checked: boolean; text?: string; onToggle: () => void; children?: ReactNode })
{
    return (
        <label className='flex min-h-10 cursor-pointer items-center gap-2 py-1'>

            <button
                type='button'
                role='checkbox'
                aria-checked={ checked }
                onClick={ onToggle }
                className={ cn(fieldSurface, 'flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-control hover:bg-btn-muted-hover') }>

                {
                    checked && <FiCheck size={ 16 } className='text-txt-muted' />
                }

            </button>

            <Text className='leading-snug'>

                { text ?? children }

            </Text>

        </label>
    );
}
