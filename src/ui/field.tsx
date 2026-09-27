import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

import Text from './text';

import { cn } from '../utility/cn';
import { T } from '../utility/language';
import { Horizontal, Vertical } from './stack';
import { fieldSurface, tapArea } from './token';

const fieldInvalid = 'border-input-error';

const roomMap = { leading: 'ps-9 pe-3', both: 'ps-10 pe-10' } as const;

const describedBy = (ids: (string | false | undefined)[]) => {
    const present = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);

    return present.length > 0 ? present.join(' ') : undefined;
};

function FieldShell({ label, error, errorId, children }: { label: string; error: string; errorId: string; children: ReactNode }) {
    const body = (
        <>
            {children}

            {error.length > 0 && <Text id={errorId} variant='caption' role='alert' tone='error' text={error} />}
        </>
    );

    if (label.length === 0) {
        return <Vertical gap={2}>{body}</Vertical>;
    }

    return (
        <label className='flex flex-col gap-2'>
            <Text text={label} />

            {body}
        </label>
    );
}

export function TextField({
    label = '',
    error = '',
    onValue,
    onEnter,
    size = 'regular',
    leading,
    trailing,
    room,
    mono = false,
    align,
    textSize,
    truncate = false,
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
    /** Pads the text clear of an icon laid over the leading edge, or over both edges. */
    room?: keyof typeof roomMap;
    mono?: boolean;
    align?: 'center';
    textSize?: 'tiny';
    truncate?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange' | 'size'>) {
    const errorId = `${useId()}-error`;

    const invalid = error.length > 0;

    return (
        <FieldShell label={label} error={error} errorId={errorId}>
            <Horizontal relative align='center'>
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
                        truncate && 'truncate',
                        room !== undefined && roomMap[room],
                        textSize === 'tiny' && 'text-tiny',
                        align === 'center' && 'text-center',
                        mono && 'font-mono'
                    )}
                    {...rest}
                />

                {trailing}
            </Horizontal>
        </FieldShell>
    );
}

export function PasswordField({
    label,
    value,
    error = '',
    onValue,
    onEnter,
    size = 'regular',
    lockSize = 0,
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
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange' | 'value' | 'size' | 'type'>) {
    const [show, setShow] = useState(false);

    const errorId = `${useId()}-error`;

    const regular = size === 'regular';
    const defaultLock = regular ? 20 : 18;
    const invalid = error.length > 0;

    return (
        <FieldShell label={label} error={error} errorId={errorId}>
            <Horizontal relative align='center'>
                <Lock size={lockSize > 0 ? lockSize : defaultLock} className={cn('absolute text-txt-muted', regular ? 'inset-s-4' : 'inset-s-3')} />

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
                    className={cn(fieldSurface, 'w-full rounded-surface text-small', regular ? 'h-11 px-12' : 'h-11 px-10', invalid && fieldInvalid)}
                    {...rest}
                />

                <button
                    type='button'
                    aria-label={T(show ? 'App.Field.HidePassword' : 'App.Field.ShowPassword')}
                    aria-pressed={show}
                    onClick={() => {
                        setShow((current) => !current);
                    }}
                    className={cn(
                        tapArea,
                        'absolute cursor-pointer rounded-control text-txt-muted outline-2 outline-offset-2 outline-transparent outline-double hover:text-txt-normal focus-visible:outline-focus-ring',
                        regular ? 'inset-e-4' : 'inset-e-3'
                    )}
                >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </Horizontal>
        </FieldShell>
    );
}

export function TextArea({
    label = '',
    error = '',
    onValue,
    tall = false,
    breaks,
    'aria-describedby': describedById,
    ...rest
}: {
    label?: string;
    error?: string;
    onValue: (value: string) => void;
    /** Room for a whole recovery phrase without scrolling. */
    tall?: boolean;
    breaks?: 'all';
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'onChange'>) {
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
                className={cn(
                    fieldSurface,
                    'w-full resize-none rounded-surface p-3 text-small',
                    invalid && fieldInvalid,
                    tall && 'min-h-28 sm:min-h-36',
                    breaks === 'all' && 'break-all'
                )}
                {...rest}
            />
        </FieldShell>
    );
}

export function ReadonlyField({ label = '', value }: { label?: string; value: string }) {
    const box = (
        <div
            dir='ltr'
            className={cn(fieldSurface, 'flex min-h-11 items-center rounded-surface px-3 py-2 font-mono text-tiny break-all text-txt-muted select-text!')}
        >
            {value}
        </div>
    );

    if (label.length === 0) {
        return box;
    }

    return (
        <Vertical gap={2}>
            <Text text={label} />

            {box}
        </Vertical>
    );
}

/** What sits over a field's leading edge — an icon, and anything said about it to a screen reader. */
export function FieldLead({ children }: { children: ReactNode }) {
    return <span className='pointer-events-none absolute inset-s-3 flex items-center text-txt-muted'>{children}</span>;
}
