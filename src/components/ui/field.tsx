import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { HiEye, HiEyeOff, HiOutlineLockClosed } from 'react-icons/hi';

import Text from './text';

import { cn } from '../../utility/cn';
import { Horizontal, Vertical } from './stack';

/**
 * The frosted text input, as Tailwind utilities.
 *
 * This was a hand-written `.glass-input` CSS class, and every declaration in it had a utility
 * equivalent. It carries a transparent outline at rest so focusing one only changes its colour and
 * nothing shifts. Exported for the agreement checkbox, which is a button dressed as an input so that
 * it matches the fields around it.
 *
 * `ease-initial` pins the easing the replaced CSS used, which Tailwind's `transition-*` would
 * otherwise override with its own curve.
 */
export const glassInput = 'border border-input-normal bg-input-bg outline-2 outline-offset-2 outline-double outline-transparent backdrop-blur-[8px] backdrop-saturate-[140%] transition-[background-color,border-color] duration-300 ease-initial focus:outline-btn-muted-outline';

/**
 * TextField - Labelled glass input with optional adornments.
 *
 * Owns the structure every text input in the app repeats — the muted label above, the relative row,
 * the shared glass-input recipe — while the caller keeps the parts that differ per site: dimensions and
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
        <Horizontal className='relative items-center'>

            { leading }

            <input
                onChange={ (event) => { onValue(event.target.value); } }
                onKeyDown={ onEnter === undefined ? undefined : (event) => { if (event.key === 'Enter') { onEnter(); } } }
                className={ cn(glassInput, 'h-11 w-full rounded-xl px-3 text-small', className) }
                { ...rest } />

            { trailing }

        </Horizontal>
    );

    if (label.length === 0)
    {
        return row;
    }

    return (
        <label className='flex flex-col gap-2'>

            <Text text={ label } />

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

            <Text text={ label } />

            <Horizontal className='relative items-center'>

                { /*
                  * Logical, not physical: the lock leads the field and the reveal control trails it, and
                  * in Persian that is the right-hand and left-hand edge respectively. Pinned to `left`
                  * and `right` they stayed put while the text they belong to flipped, which put the lock
                  * at the end of the field and the eye at its start. The padding is symmetric, so this
                  * was never an overlap — only both controls on the wrong side.
                  */ }
                <HiOutlineLockClosed
                    size={ lockSize > 0 ? lockSize : defaultLock }
                    className={ cn('absolute text-txt-muted', regular ? 'inset-s-4' : 'inset-s-3') } />

                <input
                    value={ value }
                    placeholder={ label }
                    type={ show ? 'text' : 'password' }
                    onChange={ (event) => { onValue(event.target.value); } }
                    onKeyDown={ onEnter === undefined ? undefined : (event) => { if (event.key === 'Enter') { onEnter(); } } }
                    className={ cn(glassInput, 'w-full rounded-xl text-small', regular ? 'h-12 px-12' : 'h-11 px-10', className) } />

                <button
                    type='button'
                    onClick={ () => { setShow((current) => !current); } }
                    className={ cn('absolute cursor-pointer rounded-lg text-txt-muted hover:text-txt-normal', regular ? 'inset-e-4' : 'inset-e-3') }>

                    {
                        show ? <HiEyeOff size={ 18 } /> : <HiEye size={ 18 } />
                    }

                </button>

            </Horizontal>

        </label>
    );
}

/**
 * ReadonlyField - A value the user can read but not edit, in the shape of an input.
 *
 * The account preview and the redeem screen's target address are the same thing: an address the flow
 * derived rather than asked for, shown in the field it would have occupied so it reads as part of the
 * form. Both drew the identical box by hand.
 *
 * Always `ltr` — the content is an address or a hash, which is never a right-to-left string even when
 * the interface around it is.
 * @param {object} props Component props.
 * @param {string} [props.label] Muted label above the box; omitted entirely when empty.
 * @param {string} props.value The value to show.
 * @param {string} [props.className] Extra box classes; conflicting utilities override the defaults.
 * @returns {JSX.Element} The field.
 */
export function ReadonlyField({ label = '', value, className = '' }: { label?: string; value: string; className?: string })
{
    const box = (
        <div
            dir='ltr'
            className={ cn(glassInput, 'flex min-h-11 items-center rounded-xl px-3 py-2 font-mono text-tiny break-all text-txt-muted', className) }>

            { value }

        </div>
    );

    if (label.length === 0)
    {
        return box;
    }

    return (
        <Vertical className='gap-2'>

            <Text text={ label } />

            { box }

        </Vertical>
    );
}
