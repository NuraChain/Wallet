import type { ButtonHTMLAttributes, ReactNode } from 'react';

import Spinner from './spinner';

import { cn } from '../../utility/cn';

const focusRing = 'outline-2 outline-offset-2 outline-double outline-transparent focus-visible:outline-focus-ring';

export const tapArea = 'before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2';

const fillBase = `cursor-pointer ${focusRing} transition-[background-color,border-color,color] duration-(--duration-fast) ease-initial`;

const fillMuted = `${fillBase} bg-btn-muted text-txt-muted hover:bg-btn-muted-hover hover:text-txt-normal active:bg-btn-muted-active`;

const fillNormal = `${fillBase} bg-btn-normal text-txt-normal hover:bg-btn-normal-hover active:bg-btn-normal-active`;

const fillPrimary = `${fillBase} bg-btn-primary text-txt-on-primary hover:bg-btn-primary-hover active:bg-btn-primary-active`;

const fillDanger = `${fillBase} bg-btn-danger text-txt-reverse hover:bg-btn-danger-hover active:bg-btn-danger-active`;

const fillChip = `cursor-pointer ${focusRing} border border-line bg-base-2 text-txt-normal transition-[background-color,border-color] duration-(--duration-base) ease-initial hover:bg-btn-muted-hover active:bg-btn-normal-active`;

const variantMap = {
    bare: focusRing,
    primary: fillPrimary,
    normal: fillNormal,
    muted: fillMuted,
    chip: fillChip,
    danger: `${fillMuted} text-txt-error`,
    destructive: fillDanger
} as const;

const sizeMap = {
    none: '',
    small: 'h-8 gap-1 rounded-control px-3 text-tiny',
    action: 'h-11 rounded-surface text-small',
    submit: 'h-11 w-full rounded-surface text-small',
    icon: `relative ${tapArea} size-8 rounded-control`,
    iconChip: `relative ${tapArea} size-9 rounded-surface`,
    iconLarge: `relative ${tapArea} size-10 rounded-control`
} as const;

export default function Button({
    variant = 'bare',
    size = 'none',
    text,
    loading = false,
    dim = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    className = '',
    type = 'button',
    disabled = false,
    children,
    ...rest
}: {
    variant?: keyof typeof variantMap;
    size?: keyof typeof sizeMap;
    text?: string;
    loading?: boolean;
    dim?: boolean;
    fullWidth?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
    const inactive = disabled || loading;

    return (
        <button
            type={type}
            disabled={inactive}
            aria-busy={loading || undefined}
            className={cn(
                variant !== 'bare' && 'flex items-center justify-center gap-2 disabled:cursor-not-allowed!',
                variantMap[variant],
                sizeMap[size],
                fullWidth && 'w-full',
                dim && 'disabled:opacity-60',
                className
            )}
            {...rest}
        >
            {loading && <Spinner size={16} className='shrink-0' />}

            {leftIcon}

            {text ?? children}

            {rightIcon}
        </button>
    );
}
