import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import Spinner from './spinner';

import { cn } from '../../utility/cn';

/**
 * What every button fill shares: the pointer, the resting outline, the lift on hover and the press
 * that settles back into the surface.
 *
 * These were hand-written `.btn-*` CSS classes. Every declaration in them had a utility equivalent,
 * so they live here as class strings instead — in the same vocabulary as the call sites around them,
 * and, being ordinary utilities now, overridable through `cn` rather than winning silently on cascade
 * order. That last part is what makes the `danger` variant below actually red.
 *
 * Only the properties that actually change are transitioned. A blanket `transition-all` would animate
 * `backdrop-filter` and `box-shadow` too, re-blurring the backdrop on every press. `ease-initial` is
 * equally deliberate: Tailwind's `transition-*` utilities apply their own easing curve, while the CSS
 * this replaces never set one and so used the initial `ease`.
 */
const fillBase = 'cursor-pointer outline-2 outline-offset-2 outline-double outline-transparent shadow-[0_4px_12px_var(--glass-shadow)] transition-[background-color,border-color,transform,box-shadow] duration-300 ease-initial hover:-translate-y-px active:translate-y-0 active:scale-[0.99]';

const fillMuted = `${ fillBase } border border-btn-muted-border bg-btn-muted text-txt-muted hover:bg-btn-muted-hover focus:outline-btn-muted-outline active:bg-btn-muted-active`;

/**
 * The only button fill translucent enough for the blur to actually read (8% white in dark). The
 * primary and secondary fills sit at 90% and 60%, so blurring behind them is invisible work.
 *
 * Exported alongside `fillPrimary` for the wallet tab's transfer tiles, where the fill is worn by a
 * plain square inside the button rather than by the button itself.
 */
export const fillNormal = `${ fillBase } border border-btn-normal-border bg-btn-normal text-txt-normal backdrop-blur-[10px] backdrop-saturate-[150%] hover:bg-btn-normal-hover focus:outline-btn-normal-outline active:bg-btn-normal-active`;

export const fillPrimary = `${ fillBase } border border-btn-primary-border bg-btn-primary text-txt-reverse hover:bg-btn-primary-hover focus:outline-btn-primary-outline active:bg-btn-primary-active`;

const fillSecondary = `${ fillBase } border border-btn-secondary-border bg-btn-secondary text-txt-reverse hover:bg-btn-secondary-hover focus:outline-btn-secondary-outline active:bg-btn-secondary-active`;

/**
 * The filled destructive fill, for an action that ends the session.
 */
const fillDanger = `${ fillBase } border border-btn-danger-border bg-btn-danger text-txt-reverse hover:bg-btn-danger-hover focus:outline-btn-danger-outline active:bg-btn-danger-active`;

/**
 * Apple-style control capsule.
 *
 * Where the fills above announce themselves with a fill, a shadow and a lift on hover, this stays
 * quiet: a hairline over blurred material, no elevation, and a press that scales down into the
 * surface rather than jumping off it. Used for the dashboard's account / network / settings row,
 * where three controls sit side by side and none of them is the action the user came for.
 */
const fillChip = 'cursor-pointer border border-glass-line bg-base-3 text-txt-normal outline-2 outline-offset-2 outline-double outline-transparent backdrop-blur-[10px] backdrop-saturate-[150%] transition-[background-color,transform,opacity] duration-200 ease-initial hover:bg-btn-normal-hover focus:outline-btn-muted-outline active:scale-95 active:bg-btn-normal-active';

/**
 * Class recipe for every button in the app.
 *
 * A variant is only the pairing of one of the fills above with the recurring dimension sets below.
 * Anything a call site needs beyond that (widths, margins, one-off paddings) rides in through
 * `className`, which `cn` lets win over the variant's classes.
 *
 * `danger` is the muted fill with the error text colour — the quiet treatment the small remove
 * controls use, where the button has to sit inside a list without shouting. `destructive` is the
 * filled red one, for an action that ends the session.
 */
const buttonVariants = cva('', {
    variants:
    {
        variant:
        {
            bare: '',
            primary: fillPrimary,
            secondary: fillSecondary,
            normal: fillNormal,
            muted: fillMuted,
            chip: fillChip,
            danger: `${ fillMuted } text-txt-error`,
            destructive: fillDanger
        },
        size:
        {
            none: '',
            action: 'h-11 rounded-xl text-small',
            icon: 'size-8 rounded-lg',
            iconChip: 'size-9 rounded-xl',
            iconLarge: 'size-10 rounded-lg'
        }
    },
    defaultVariants:
    {
        variant: 'bare',
        size: 'none'
    }
});

/**
 * Button - The app's single button implementation.
 *
 * A styled variant gets the shared flex centring and `gap-2`; `bare` gets nothing, so controls with
 * their own complete look (nav tabs, window controls, inline icon toggles) still route through this
 * component for the `type='button'` default without inheriting any classes.
 *
 * `loading` renders the standard spinner ahead of the label — the caller keeps control of the label,
 * so swapping text while busy stays a one-line ternary at the call site.
 *
 * A styled variant also owns the disabled cursor, which seven call sites were each spelling out. The
 * fade stays with the caller: `disabled` means "not available yet" on an action button, where dimming
 * is right, and "this is the one you are already on" in the language and network pickers, where it is
 * not.
 *
 * A button whose whole content is a label passes it as `text` and self-closes; `children` stays for
 * the ones that compose something — an icon beside a label, a stacked icon and caption, a nav tab.
 * Both render in the same slot, so the two forms are interchangeable and never combine.
 * @param {object} props Component props.
 * @param {string} [props.variant] Fill: `primary`, `secondary`, `normal`, `muted`, `chip`, `danger`, `destructive`, or `bare` for none.
 * @param {string} [props.size] Recurring dimensions: `action` rows, `icon`/`iconChip`/`iconLarge` squares, or `none`.
 * @param {string} [props.text] The button's label, when that is all it holds.
 * @param {boolean} [props.loading] Shows the spinner ahead of the label.
 * @param {boolean} [props.fullWidth] Stretches the button to the container width.
 * @param {ReactNode} [props.leftIcon] Rendered before the label.
 * @param {ReactNode} [props.rightIcon] Rendered after the label.
 * @param {string} [props.className] Extra classes; conflicting utilities override the variant's.
 * @returns {JSX.Element} The button.
 */
export default function Button({ variant = 'bare', size = 'none', text, loading = false, fullWidth = false, leftIcon, rightIcon, className = '', type = 'button', children, ...rest }: { text?: string; loading?: boolean; fullWidth?: boolean; leftIcon?: ReactNode; rightIcon?: ReactNode } & VariantProps<typeof buttonVariants> & ButtonHTMLAttributes<HTMLButtonElement>)
{
    return (
        <button
            type={ type }
            className={ cn(variant !== 'bare' && 'flex items-center justify-center gap-2 disabled:cursor-not-allowed!', buttonVariants({ variant, size }), fullWidth && 'w-full', className) }
            { ...rest }>

            {
                loading && <Spinner size={ 16 } className='shrink-0' />
            }

            { leftIcon }

            { text ?? children }

            { rightIcon }

        </button>
    );
}
