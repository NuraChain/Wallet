import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { HiEye, HiEyeOff, HiOutlineLockClosed } from 'react-icons/hi';

import { cn } from '../../utility/cn';

/**
 * TextField - Labelled glass input with optional adornments.
 *
 * Owns the structure every text input in the app repeats — the muted label above, the relative row,
 * the `glass-input` styling — while the caller keeps the parts that differ per site: dimensions and
 * font via `className`, and absolutely-positioned `leading`/`trailing` nodes passed in complete, so a
 * search icon or a reload control renders exactly as it did inline.
 *
 * `onValue` replaces the `(event) => setX(event.target.value)` handler every call site wrote; native
 * input attributes still pass straight through.
 * @param {object} props Component props.
 * @param {string} [props.label] Muted label rendered above the input; omitted entirely when empty.
 * @param {(value: string) => void} props.onValue Receives the input's value on change.
 * @param {() => void} [props.onEnter] Called when Enter is pressed.
 * @param {ReactNode} [props.leading] Absolutely-positioned node at the start of the row.
 * @param {ReactNode} [props.trailing] Absolutely-positioned node at the end of the row.
 * @param {string} [props.className] Extra input classes; conflicting utilities override the defaults.
 * @returns {JSX.Element} The field.
 */
export function TextField({ label = '', onValue, onEnter, leading, trailing, className = '', ...rest }: { label?: string; onValue: (value: string) => void; onEnter?: () => void; leading?: ReactNode; trailing?: ReactNode; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange'>)
{
    const row = (
        <div className='relative flex items-center'>

            { leading }

            <input
                onChange={ (event) => { onValue(event.target.value); } }
                onKeyDown={ onEnter === undefined ? undefined : (event) => { if (event.key === 'Enter') { onEnter(); } } }
                className={ cn('glass-input h-11 w-full rounded-xl px-3 text-small', className) }
                { ...rest } />

            { trailing }

        </div>
    );

    if (label.length === 0)
    {
        return row;
    }

    return (
        <label className='flex flex-col gap-2'>

            <div className='text-tiny text-txt-muted'>

                { label }

            </div>

            { row }

        </label>
    );
}

/**
 * PasswordField - The lock-icon password input with its show/hide toggle.
 *
 * The reveal state lives here rather than in every parent, so the six copies of `showPassword`
 * state and the eye-toggle markup collapse into one place. Two sizes cover every use: `regular` is
 * the full-height field on the unlock and intro screens, `compact` the tighter one inside modals.
 * @param {object} props Component props.
 * @param {string} props.label Muted label above the field, reused as the placeholder default.
 * @param {string} props.value The current password.
 * @param {(value: string) => void} props.onValue Receives the value on change.
 * @param {() => void} [props.onEnter] Called when Enter is pressed.
 * @param {'regular' | 'compact'} [props.size] Field height and icon inset.
 * @param {number} [props.lockSize] Size of the lock icon, when a site deviates from the size default.
 * @param {string} [props.className] Extra input classes (e.g. a different radius).
 * @returns {JSX.Element} The field.
 */
export function PasswordField({ label, value, onValue, onEnter, size = 'regular', lockSize = 0, className = '' }: { label: string; value: string; onValue: (value: string) => void; onEnter?: () => void; size?: 'regular' | 'compact'; lockSize?: number; className?: string })
{
    const [ show, setShow ] = useState(false);

    const regular = size === 'regular';
    const defaultLock = regular ? 20 : 18;

    return (
        <label className='flex flex-col gap-2'>

            <div className='text-tiny text-txt-muted'>

                { label }

            </div>

            <div className='relative flex items-center'>

                <HiOutlineLockClosed
                    size={ lockSize > 0 ? lockSize : defaultLock }
                    className={ cn('absolute text-txt-muted', regular ? 'left-4' : 'left-3') } />

                <input
                    value={ value }
                    placeholder={ label }
                    type={ show ? 'text' : 'password' }
                    onChange={ (event) => { onValue(event.target.value); } }
                    onKeyDown={ onEnter === undefined ? undefined : (event) => { if (event.key === 'Enter') { onEnter(); } } }
                    className={ cn('glass-input w-full rounded-xl text-small', regular ? 'h-12 px-12' : 'h-11 px-10', className) } />

                <button
                    type='button'
                    onClick={ () => { setShow((current) => !current); } }
                    className={ cn('absolute cursor-pointer rounded-lg text-txt-muted hover:text-txt-normal', regular ? 'right-4' : 'right-3') }>

                    {
                        show ? <HiEyeOff size={ 18 } /> : <HiEye size={ 18 } />
                    }

                </button>

            </div>

        </label>
    );
}
