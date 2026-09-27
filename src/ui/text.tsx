import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import { cn } from '../utility/cn';
import { placement, splitPlacement, type Placement } from './place';

const variantMap = {
    caption: 'text-tiny text-txt-muted',
    captionStrong: 'text-tiny text-txt-normal',
    inherit: 'text-tiny',
    body: 'text-small text-txt-normal',
    bodyMuted: 'text-small text-txt-muted',
    title: 'text-medium font-semibold text-txt-normal',
    heading: 'text-large font-semibold text-txt-normal',
    display: 'text-display font-bold text-txt-normal'
} as const;

// The size each variant starts from, so `scaleUp` knows which step comes next.
const variantSize = {
    caption: 'tiny',
    captionStrong: 'tiny',
    inherit: 'tiny',
    body: 'small',
    bodyMuted: 'small',
    title: 'medium',
    heading: 'large',
    display: 'display'
} as const;

const sizeMap = { small: 'text-small', large: 'text-large' } as const;

// One step up from `sm`, for the headline and lede that get room to breathe on a wider screen.
const scaleUpMap: Partial<Record<string, string>> = { tiny: 'sm:text-small', small: 'sm:text-medium', medium: 'sm:text-large' };

const toneMap = { normal: 'text-txt-normal', accent: 'text-txt-accent', error: 'text-txt-error', onPrimary: 'text-txt-on-primary' } as const;

const alignMap = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;

const breaksMap = { all: 'break-all', words: 'wrap-break-word' } as const;

const leadingMap = { snug: 'leading-snug', relaxed: 'leading-relaxed' } as const;

export interface TextProps extends Placement {
    variant?: keyof typeof variantMap;
    as?: ElementType;
    text?: string;
    /** Overrides the variant's size. */
    size?: keyof typeof sizeMap;
    /** Steps the size up once at `sm`. */
    scaleUp?: boolean;
    /** Overrides the variant's colour. */
    tone?: keyof typeof toneMap;
    align?: keyof typeof alignMap;
    truncate?: boolean;
    mono?: boolean;
    weight?: 'medium';
    tabular?: boolean;
    breaks?: keyof typeof breaksMap;
    /** Keeps the text's own line breaks and runs of spaces. */
    pre?: boolean;
    /** Selectable even inside a surface that turns selection off. */
    selectable?: boolean;
    leading?: keyof typeof leadingMap;
    /** There for assistive technology only. */
    srOnly?: boolean;
    maxWidth?: 'sm';
    /** Set in a recessed box of its own, apart from the surface around it. */
    inset?: boolean;
    pt?: 1;
    py?: 2;
    children?: ReactNode;
}

/* oxlint-disable-next-line @typescript-eslint/naming-convention */
export default function Text(props: TextProps & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
    const [
        place,
        {
            variant = 'caption',
            as: Tag = 'div',
            text,
            size,
            scaleUp = false,
            tone,
            align,
            truncate = false,
            mono = false,
            weight,
            tabular = false,
            breaks,
            pre = false,
            selectable = false,
            leading,
            srOnly = false,
            maxWidth,
            inset = false,
            pt,
            py,
            children,
            ...rest
        }
    ] = splitPlacement(props);

    return (
        <Tag
            className={cn(
                variantMap[variant],
                srOnly && 'sr-only',
                inset && 'rounded-surface bg-base-3 p-2',
                pt === 1 && 'pt-1',
                py === 2 && 'py-2',
                maxWidth === 'sm' && 'max-w-sm',
                truncate && 'truncate',
                mono && 'font-mono',
                weight === 'medium' && 'font-medium',
                tabular && 'tabular-nums',
                breaks !== undefined && breaksMap[breaks],
                pre && 'whitespace-pre-wrap',
                selectable && 'select-text!',
                leading !== undefined && leadingMap[leading],
                align !== undefined && alignMap[align],
                size !== undefined && sizeMap[size],
                scaleUp && scaleUpMap[size ?? variantSize[variant]],
                tone !== undefined && toneMap[tone],
                placement(place, true)
            )}
            {...rest}
        >
            {text ?? children}
        </Tag>
    );
}
