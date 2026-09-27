import type { ButtonHTMLAttributes, ReactNode } from 'react';

import Spinner from './spinner';

import { cn } from '../utility/cn';
import { fieldSurface, focusRing, selectedTint, tapArea } from './token';
import { placement, splitPlacement, type Placement } from './place';

const fillBase = `cursor-pointer ${focusRing} transition-[background-color,border-color,color] duration-(--duration-fast) ease-initial`;

const fillMuted = `${fillBase} bg-btn-muted text-txt-muted hover:bg-btn-muted-hover hover:text-txt-normal active:bg-btn-muted-active`;

const fillNormal = `${fillBase} bg-btn-normal text-txt-normal hover:bg-btn-normal-hover active:bg-btn-normal-active`;

const fillPrimary = `${fillBase} bg-linear-to-r from-btn-primary to-btn-primary-border text-txt-on-primary hover:from-btn-primary-hover hover:to-btn-primary-hover active:from-btn-primary-active active:to-btn-primary-active`;

const fillDanger = `${fillBase} bg-btn-danger text-txt-reverse hover:bg-btn-danger-hover active:bg-btn-danger-active`;

const fillChip = `cursor-pointer ${focusRing} border border-line bg-base-2 text-txt-normal transition-[background-color,border-color] duration-(--duration-base) ease-initial hover:bg-btn-muted-hover active:bg-btn-normal-active`;

const tabBase = `relative h-10 cursor-pointer px-3 text-small font-medium transition-colors duration-(--duration-fast)`;

const optionBase = 'flex w-full cursor-pointer items-center gap-3 rounded-control border border-transparent p-2 transition-colors duration-(--duration-fast)';

/** Filled variants: a centred row of icon and label on a surface of their own. */
const fillMap = {
    primary: fillPrimary,
    normal: fillNormal,
    muted: fillMuted,
    chip: fillChip,
    danger: `${fillMuted} text-txt-error`,
    destructive: fillDanger
} as const;

/**
 * Bare variants: no fill and no built-in layout, for a control whose whole look is its purpose —
 * a list row, a tab, a window control. Each is named for that purpose, not for its classes.
 */
const bareMap = {
    bare: focusRing,
    plain: `${focusRing} cursor-pointer`,
    logo: `${focusRing} cursor-pointer rounded-surface`,
    row: `${focusRing} flex cursor-pointer items-center gap-3 text-start`,
    rowTight: `${focusRing} flex cursor-pointer items-center gap-1.5`,
    listRow: `${focusRing} flex items-center gap-3 p-3 text-start not-disabled:cursor-pointer not-disabled:hover:bg-btn-muted-hover`,
    inlineRow: `${focusRing} flex cursor-pointer items-center gap-2`,
    inlineSubtle: `${focusRing} flex cursor-pointer items-center gap-1 text-tiny text-txt-muted hover:text-txt-normal`,
    tab: `${focusRing} ${tabBase} text-txt-muted hover:text-txt-normal`,
    tabOn: `${focusRing} ${tabBase} text-txt-accent`,
    option: `${focusRing} ${optionBase} hover:bg-btn-muted-hover`,
    optionOn: `${focusRing} ${optionBase} ${selectedTint}`,
    fieldSelect: `${focusRing} ${fieldSurface} flex h-14 w-full cursor-pointer items-center gap-3 rounded-surface px-3`,
    fieldAction: `${focusRing} ${tapArea} absolute -inset-e-0.5 size-8 cursor-pointer rounded-control text-txt-muted hover:text-txt-normal`,
    tabClose: `${focusRing} flex size-8 cursor-pointer items-center justify-center rounded-control text-txt-muted hover:bg-base-2`,
    veil: `${focusRing} absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-surface bg-base-2/60 text-txt-normal hover:bg-base-2/70`,
    window: `${focusRing} flex h-full w-10 cursor-pointer items-center justify-center text-txt-normal transition-colors duration-(--duration-base) hover:bg-btn-muted-hover active:bg-btn-muted-active`
} as const;

const sizeMap = {
    none: '',
    small: 'h-8 gap-1 rounded-control px-3 text-tiny',
    action: 'h-11 rounded-surface text-small',
    /** An action sized to its label rather than stretched by its row. */
    actionFit: 'h-11 rounded-surface px-4 text-small',
    submit: 'h-11 w-full rounded-surface text-small',
    /** A page's one submit: the full width on a phone, its own width from `sm`. */
    cta: 'mx-auto h-11 w-full rounded-surface text-small sm:w-fit sm:px-8',
    ctaWide: 'mx-auto h-11 w-full rounded-surface text-small sm:w-fit sm:min-w-40 sm:px-8',
    icon: `relative ${tapArea} size-8 rounded-control`,
    iconChip: `relative ${tapArea} size-9 rounded-surface`,
    iconChipSmall: `relative ${tapArea} size-8 rounded-surface`,
    iconLarge: `relative ${tapArea} size-10 rounded-control`,
    /** The wallet header's account and network chips. */
    selector: 'h-9 gap-1.5 rounded-surface ps-1 pe-2.5 text-tiny',
    /** The wallet's send, receive and redeem tiles. */
    tile: 'h-16 w-20 flex-col gap-1 rounded-surface',
    /** One choice in a row of filter segments. */
    segment: 'h-8 rounded-control text-tiny transition-colors duration-(--duration-base)',
    menu: 'h-12 gap-3 rounded-surface px-3',
    emoji: 'h-10 w-full rounded-control text-medium',
    entry: 'h-12 rounded-control p-2',
    picker: 'h-10 w-fit justify-start rounded-control p-2',
    siteRow: 'h-12 gap-2.5 rounded-surface px-2.5 text-start',
    siteCard: 'h-16 justify-start gap-2.5 rounded-surface px-3 text-start',
    siteAdd: 'h-16 items-center justify-center gap-2 rounded-surface border-dashed px-3 text-txt-muted hover:text-txt-normal'
} as const;

export type ButtonVariant = keyof typeof fillMap | keyof typeof bareMap;

const isFilled = (variant: ButtonVariant): variant is keyof typeof fillMap => variant in fillMap;

export default function Button(
    props: {
        variant?: ButtonVariant;
        size?: keyof typeof sizeMap;
        text?: string;
        /** A label that is cut to one line when the row squeezes the button, where `text` would wrap. */
        label?: string;
        loading?: boolean;
        dim?: boolean;
        fullWidth?: boolean;
        /** The choice already in effect: tinted, and pressing it does nothing. */
        selected?: boolean;
        /** Disabled because it is the current choice, not because it is unavailable. */
        current?: boolean;
        /** The glyph of an icon button, or one set before its label. */
        icon?: ReactNode;
        leftIcon?: ReactNode;
        rightIcon?: ReactNode;
    } & Placement &
        Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>
) {
    const [
        place,
        {
            variant = 'bare',
            size = 'none',
            text,
            label,
            loading = false,
            dim = false,
            fullWidth = false,
            selected = false,
            current = false,
            icon,
            leftIcon,
            rightIcon,
            type = 'button',
            disabled = false,
            children,
            ...rest
        }
    ] = splitPlacement(props);

    const inactive = disabled || loading;

    return (
        <button
            type={type}
            disabled={inactive}
            className={cn(
                isFilled(variant) && 'flex items-center justify-center gap-2 disabled:cursor-not-allowed!',
                isFilled(variant) ? fillMap[variant] : bareMap[variant],
                sizeMap[size],
                fullWidth && 'w-full',
                dim && 'disabled:opacity-60',
                selected && `${selectedTint} cursor-default`,
                current && 'disabled:cursor-default!',
                placement(place)
            )}
            {...rest}
        >
            {leftIcon}

            {icon}

            {text ?? children}

            {label !== undefined && <span className='truncate'>{label}</span>}

            {loading && <Spinner size={16} shrink={false} />}

            {rightIcon}
        </button>
    );
}
