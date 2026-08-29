import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { FiEye, FiEyeOff, FiLock } from 'react-icons/fi';

import Text from './text';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { Horizontal, Vertical } from './stack';

/**
 * The text-input material.
 *
 * The fill is opaque and the border is `input-normal`, which is the one line weight in the app that
 * has to clear 3:1 against what it encloses — a field's boundary is the only thing telling the user
 * where the control is, so unlike a card's decorative hairline it is load-bearing under WCAG 1.4.11.
 *
 * It carries a transparent outline at rest so focusing one only changes a colour and nothing shifts,
 * and the focus ring is `focus-visible` for the same reason it is on `Button`: pinning a transparent
 * outline suppresses the user agent's own ring, so a plain `focus:` fired on mouse clicks too.
 *
 * Exported for the agreement checkbox, which is a button dressed as an input so that it matches the
 * fields around it.
 *
 * `ease-initial` pins the easing the replaced CSS used, which Tailwind's `transition-*` would
 * otherwise override with its own curve.
 */
export const fieldSurface =
    'border border-input-normal bg-input-bg outline-2 outline-offset-2 outline-double outline-transparent transition-[background-color,border-color] duration-(--duration-fast) ease-initial focus-visible:outline-focus-ring';

/**
 * What a field wears once it is holding an invalid value.
 *
 * `--input-error` existed in both theme blocks and was referenced by nothing: the token had been
 * minted for a state no field ever implemented, so every validation failure in the app was announced
 * by a message somewhere else on the surface while the field that caused it looked untouched.
 */
const fieldInvalid = 'border-input-error';

/**
 * describedBy - Joins the ids a control is described by, or `undefined` when there are none.
 *
 * `aria-describedby=''` is not the same as omitting it, so an empty join has to collapse away.
 * @param {(string | false | undefined)[]} ids The candidate ids.
 * @returns {string | undefined} The space-separated list, or `undefined`.
 */
const describedBy = (ids: (string | false | undefined)[]) => {
    const present = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);

    return present.length > 0 ? present.join(' ') : undefined;
};

/**
 * FieldShell - The label, the control, and the error line underneath it.
 *
 * Every field in the app repeats this and only this, so the three primitives below hand it their
 * control and stop describing the frame around it. When `label` is empty the wrapper collapses to a
 * bare fragment rather than emitting an empty `<label>`, which is what used to leave fifteen inputs
 * with no accessible name at all.
 * @param {object} props Component props.
 * @param {string} props.label Muted label above the control; omitted entirely when empty.
 * @param {string} props.error Validation message; omitted entirely when empty.
 * @param {string} props.errorId Id the control points `aria-describedby` at.
 * @param {ReactNode} props.children The control itself.
 * @returns {JSX.Element} The field.
 */
function FieldShell({ label, error, errorId, children }: { label: string; error: string; errorId: string; children: ReactNode }) {
    const body = (
        <>
            {children}

            {error.length > 0 && <Text id={errorId} variant='caption' role='alert' className='text-txt-error' text={error} />}
        </>
    );

    if (label.length === 0) {
        return <Vertical className='gap-2'>{body}</Vertical>;
    }

    return (
        <label className='flex flex-col gap-2'>
            <Text text={label} />

            {body}
        </label>
    );
}

/**
 * TextField - Labelled text input with optional adornments.
 *
 * Owns the structure every text input in the app repeats — the muted label above, the relative row,
 * the shared field recipe — while the caller keeps the parts that differ per site: dimensions and
 * font via `className`, and absolutely-positioned `leading`/`trailing` nodes passed in complete, so a
 * search icon or a reload control renders exactly as it did inline.
 *
 * `onValue` replaces the `(event) => setX(event.target.value)` handler every call site wrote; native
 * input attributes still pass straight through.
 *
 * `error` does three things at once, because they are one fact: it tints the border with the token
 * minted for it, sets `aria-invalid`, and points `aria-describedby` at the message it renders. A
 * field that is wrong should not need the call site to remember three attributes.
 *
 * A caller's own `aria-describedby` is destructured out of the rest and joined rather than spread, so
 * the two descriptions add up. Left in the rest it would land after ours and replace it, which would
 * mean passing a hint id silently unlinked the error message.
 * @param {object} props Component props.
 * @param {string} [props.label] Muted label rendered above the input; omitted entirely when empty.
 * @param {string} [props.error] Validation message; also marks the field invalid.
 * @param {(value: string) => void} props.onValue Receives the input's value on change.
 * @param {() => void} [props.onEnter] Called when Enter is pressed.
 * @param {'regular' | 'compact'} [props.size] Field height.
 * @param {ReactNode} [props.leading] Absolutely-positioned node at the start of the row.
 * @param {ReactNode} [props.trailing] Absolutely-positioned node at the end of the row.
 * @param {string} [props.className] Extra input classes; conflicting utilities override the defaults.
 * @returns {JSX.Element} The field.
 */
export function TextField({
    label = '',
    error = '',
    onValue,
    onEnter,
    size = 'regular',
    leading,
    trailing,
    className = '',
    'aria-describedby': describedById,
    ...rest
}: {
    label?: string;
    error?: string;
    onValue: (value: string) => void;
    onEnter?: () => void;
    size?: 'regular' | 'compact';
    leading?: ReactNode;
    trailing?: ReactNode;
    className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange' | 'size'>) {
    const errorId = `${useId()}-error`;

    const invalid = error.length > 0;

    return (
        <FieldShell label={label} error={error} errorId={errorId}>
            <Horizontal className='relative items-center'>
                {leading}

                <input
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy([invalid && errorId, describedById])}
                    onChange={(event) => {
                        onValue(event.target.value);
                    }}
                    onKeyDown={
                        onEnter === undefined
                            ? undefined
                            : (event) => {
                                  if (event.key === 'Enter') {
                                      onEnter();
                                  }
                              }
                    }
                    className={cn(
                        fieldSurface,
                        'w-full rounded-surface px-3 text-small',
                        size === 'regular' ? 'h-11' : 'h-9',
                        invalid && fieldInvalid,
                        className
                    )}
                    {...rest}
                />

                {trailing}
            </Horizontal>
        </FieldShell>
    );
}

/**
 * PasswordField - The lock-icon password input with its show/hide toggle.
 *
 * The reveal state lives here rather than in every parent, so the six copies of `showPassword`
 * state and the eye-toggle markup collapse into one place.
 *
 * The two sizes no longer differ in height — both are the app's one control height, which is what
 * stopped the intro and unlock screens reading as a different product from the dashboard. What is
 * left of `size` is the inset the lock and the reveal control sit at, which does still differ: a
 * field inside a dialog has less room either side of it than one on a page of its own.
 *
 * Native attributes spread onto the input, which they previously did not. That was not a stylistic
 * gap: with no rest-spread there was no way for any call site to set `autoComplete`, so a password
 * manager had nothing telling it which of these fields was the current password and which two were
 * a new one being confirmed.
 * @param {object} props Component props.
 * @param {string} props.label Muted label above the field, reused as the placeholder default.
 * @param {string} props.value The current password.
 * @param {string} [props.error] Validation message; also marks the field invalid.
 * @param {(value: string) => void} props.onValue Receives the value on change.
 * @param {() => void} [props.onEnter] Called when Enter is pressed.
 * @param {'regular' | 'compact'} [props.size] Inset of the lock and reveal controls, and the lock's size.
 * @param {number} [props.lockSize] Size of the lock icon, when a site deviates from the size default.
 * @param {string} [props.className] Extra input classes (e.g. a different radius).
 * @returns {JSX.Element} The field.
 */
export function PasswordField({
    label,
    value,
    error = '',
    onValue,
    onEnter,
    size = 'regular',
    lockSize = 0,
    className = '',
    'aria-describedby': describedById,
    ...rest
}: {
    label: string;
    value: string;
    error?: string;
    onValue: (value: string) => void;
    onEnter?: () => void;
    size?: 'regular' | 'compact';
    lockSize?: number;
    className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange' | 'value' | 'size' | 'type'>) {
    const [show, setShow] = useState(false);

    const errorId = `${useId()}-error`;

    const regular = size === 'regular';
    const defaultLock = regular ? 20 : 18;
    const invalid = error.length > 0;

    return (
        <FieldShell label={label} error={error} errorId={errorId}>
            <Horizontal className='relative items-center'>
                {/*
                 * Logical, not physical: the lock leads the field and the reveal control trails it, and
                 * in Persian that is the right-hand and left-hand edge respectively. Pinned to `left`
                 * and `right` they stayed put while the text they belong to flipped, which put the lock
                 * at the end of the field and the eye at its start. The padding is symmetric, so this
                 * was never an overlap — only both controls on the wrong side.
                 */}
                <FiLock size={lockSize > 0 ? lockSize : defaultLock} className={cn('absolute text-txt-muted', regular ? 'inset-s-4' : 'inset-s-3')} />

                <input
                    value={value}
                    placeholder={label}
                    type={show ? 'text' : 'password'}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy([invalid && errorId, describedById])}
                    onChange={(event) => {
                        onValue(event.target.value);
                    }}
                    onKeyDown={
                        onEnter === undefined
                            ? undefined
                            : (event) => {
                                  if (event.key === 'Enter') {
                                      onEnter();
                                  }
                              }
                    }
                    className={cn(fieldSurface, 'w-full rounded-surface text-small', regular ? 'h-11 px-12' : 'h-11 px-10', invalid && fieldInvalid, className)}
                    {...rest}
                />

                {/*
                 * Named, because it is an icon-only control whose glyph is the only thing that says
                 * what it does — and the glyph is what changes when it is pressed.
                 */}
                <button
                    type='button'
                    aria-label={T(show ? 'App.Field.HidePassword' : 'App.Field.ShowPassword')}
                    aria-pressed={show}
                    onClick={() => {
                        setShow((current) => !current);
                    }}
                    className={cn(
                        'tap-44 absolute cursor-pointer rounded-control text-txt-muted outline-2 outline-offset-2 outline-transparent outline-double hover:text-txt-normal focus-visible:outline-focus-ring',
                        regular ? 'inset-e-4' : 'inset-e-3'
                    )}
                >
                    {show ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
            </Horizontal>
        </FieldShell>
    );
}

/**
 * TextArea - The multi-line field.
 *
 * One call site, and it is the one that mattered: the recovery-phrase box on the import screen was
 * the only raw form element left outside this directory, and it had opted out of the entire recipe —
 * a different fill, no border, and `outline-0`, which made it the single place in the codebase where
 * the focus ring was deleted outright. It is the field a seed phrase is pasted into.
 * @param {object} props Component props.
 * @param {string} [props.label] Muted label above the box; omitted entirely when empty.
 * @param {string} [props.error] Validation message; also marks the field invalid.
 * @param {(value: string) => void} props.onValue Receives the value on change.
 * @param {string} [props.className] Extra classes; conflicting utilities override the defaults.
 * @returns {JSX.Element} The field.
 */
export function TextArea({
    label = '',
    error = '',
    onValue,
    className = '',
    'aria-describedby': describedById,
    ...rest
}: { label?: string; error?: string; onValue: (value: string) => void; className?: string } & Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'className' | 'onChange'
>) {
    const errorId = `${useId()}-error`;

    const invalid = error.length > 0;

    return (
        <FieldShell label={label} error={error} errorId={errorId}>
            <textarea
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy([invalid && errorId, describedById])}
                onChange={(event) => {
                    onValue(event.target.value);
                }}
                className={cn(fieldSurface, 'w-full resize-none rounded-surface p-3 text-small', invalid && fieldInvalid, className)}
                {...rest}
            />
        </FieldShell>
    );
}

/**
 * ReadonlyField - A value the user can read but not edit, in the shape of an input.
 *
 * The account preview and the redeem screen's target address are the same thing: an address the flow
 * derived rather than asked for, shown in the field it would have occupied so it reads as part of the
 * form. Both drew the identical box by hand, as did the three diagnostic blocks on the failure
 * screens, which is why `select-text!` lives here — a value worth showing is a value worth copying,
 * and the app's global selection reset would otherwise make that impossible.
 *
 * Always `ltr` — the content is an address or a hash, which is never a right-to-left string even when
 * the interface around it is.
 * @param {object} props Component props.
 * @param {string} [props.label] Muted label above the box; omitted entirely when empty.
 * @param {string} props.value The value to show.
 * @param {string} [props.className] Extra box classes; conflicting utilities override the defaults.
 * @returns {JSX.Element} The field.
 */
export function ReadonlyField({ label = '', value, className = '' }: { label?: string; value: string; className?: string }) {
    const box = (
        <div
            dir='ltr'
            className={cn(
                fieldSurface,
                'flex min-h-11 items-center rounded-surface px-3 py-2 font-mono text-tiny break-all text-txt-muted select-text!',
                className
            )}
        >
            {value}
        </div>
    );

    if (label.length === 0) {
        return box;
    }

    return (
        <Vertical className='gap-2'>
            <Text text={label} />

            {box}
        </Vertical>
    );
}
