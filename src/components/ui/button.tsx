import type { ButtonHTMLAttributes, ReactNode } from 'react';

import Spinner from './spinner';

import { cn } from '../../utility/cn';

/**
 * The focus ring, worn by every button including `bare`.
 *
 * Two things changed here and they depend on each other. It is `focus-visible` rather than `focus`,
 * so the ring answers the keyboard and stays out of the way of the mouse — pinning a transparent
 * outline at rest suppresses the user agent's own `:focus-visible` ring, so the old `focus:` spelling
 * meant a styled button flashed a ring on every click while `bare` showed nothing at all on Tab. And
 * it is one colour rather than five: a ring that changes colour by variant is a ring the eye has to
 * re-learn.
 *
 * The transparent resting outline stays. Focusing then only changes a colour, so nothing reflows.
 */
const focusRing = 'outline-2 outline-offset-2 outline-double outline-transparent focus-visible:outline-focus-ring';

/**
 * What every button fill shares: the pointer, the focus ring, and state changes that answer in the
 * fill itself.
 *
 * This generation of the interface does not move its buttons. The lift on hover and the press-scale
 * are gone — a control that jumps off the page reads as decoration, and on a dense list of controls
 * the whole surface twitched whenever the pointer crossed it. State now lives where the eye already
 * is: the background steps between rest, hover and active. Only the properties that actually change
 * are transitioned; a blanket `transition-all` would drag layout properties into every hover, and
 * nothing here changes size or position.
 */
const fillBase = `cursor-pointer ${ focusRing } transition-[background-color,border-color,color] duration-(--duration-fast) ease-initial`;

/**
 * The quiet workhorse: a soft neutral step over the page, no border, no elevation.
 */
const fillMuted = `${ fillBase } bg-btn-muted text-txt-muted hover:bg-btn-muted-hover hover:text-txt-normal active:bg-btn-muted-active`;

/**
 * The raised neutral fill.
 */
const fillNormal = `${ fillBase } bg-btn-normal text-txt-normal hover:bg-btn-normal-hover active:bg-btn-normal-active`;

const fillPrimary = `${ fillBase } bg-btn-primary text-txt-reverse hover:bg-btn-primary-hover active:bg-btn-primary-active`;

/**
 * The filled destructive fill, for an action that ends the session.
 */
const fillDanger = `${ fillBase } bg-btn-danger text-txt-reverse hover:bg-btn-danger-hover active:bg-btn-danger-active`;

/**
 * The quiet control chip.
 *
 * A hairline over the card tone, no elevation, and a press that settles into the surface. Used for
 * the dashboard's account / network / settings row, where three controls sit side by side and none
 * of them is the action the user came for.
 */
const fillChip = `cursor-pointer ${ focusRing } border border-line bg-base-2 text-txt-normal transition-[background-color,border-color] duration-(--duration-base) ease-initial hover:bg-btn-muted-hover active:bg-btn-normal-active`;

/**
 * The fills a button can wear.
 *
 * `danger` is the muted fill with the error text colour — the quiet treatment the small remove
 * controls use, where the button has to sit inside a list without shouting. `destructive` is the
 * filled red one, for an action that ends the session.
 *
 * `bare` is not empty: it is the focus ring and nothing else. Controls with their own complete look
 * (nav tabs, window controls, transfer-bar segments, inline icon toggles) route through here for the
 * `type='button'` default without inheriting a fill, and they still have to be findable from the
 * keyboard.
 */
const variantMap =
{
    bare: focusRing,
    primary: fillPrimary,
    normal: fillNormal,
    muted: fillMuted,
    chip: fillChip,
    danger: `${ fillMuted } text-txt-error`,
    destructive: fillDanger
} as const;

/**
 * The recurring dimension sets.
 *
 * `small` is the section-header action — Manage, Overview, Add — which four call sites were each
 * spelling out identically until one of them drifted onto a different fill. `action` is the standard
 * control row, and `submit` is that same control committed to the full width, which is the shape
 * every primary submit in the app wants. There is deliberately no second height for submits: the
 * intro and unlock screens hand-wrote `h-12` while the dashboard used `h-11`, and one job with two
 * heights is what made onboarding read as a different application from the product.
 *
 * The icon squares carry `tap-44`, which grows the hit area to the platform minimum without changing
 * a pixel of what is drawn. A 32px glyph button is a 32px target otherwise, and on a touch screen
 * that is the difference between hitting the control and hitting the row behind it.
 */
const sizeMap =
{
    none: '',
    small: 'h-8 gap-1 rounded-control px-3 text-tiny',
    action: 'h-11 rounded-surface text-small',
    submit: 'h-11 w-full rounded-surface text-small',
    icon: 'tap-44 size-8 rounded-control',
    iconChip: 'tap-44 size-9 rounded-surface',
    iconLarge: 'tap-44 size-10 rounded-control'
} as const;

/**
 * Button - The app's single button implementation.
 *
 * A styled variant gets the shared flex centring and `gap-2`; `bare` gets only the focus ring, so
 * controls with their own complete look still route through this component without inheriting a fill.
 *
 * `loading` renders the standard spinner ahead of the label *and* disables the button, because a
 * control that is busy is a control that must not be pressed again — the spinner alone left a
 * double-tap firing the handler twice. The caller keeps control of the label, so swapping text while
 * busy stays a one-line ternary at the call site.
 *
 * A styled variant also owns the disabled cursor. The fade is `dim`, opt-in rather than automatic:
 * `disabled` means "not available yet" on an action button, where dimming is right, and "this is the
 * one you are already on" in the language and network pickers, where it is not. Twelve call sites
 * were each writing that fade by hand, and had drifted into two different opacities.
 *
 * A button whose whole content is a label passes it as `text` and self-closes; `children` stays for
 * the ones that compose something — an icon beside a label, a stacked icon and caption, a nav tab.
 * Both render in the same slot, so the two forms are interchangeable and never combine.
 * @param {object} props Component props.
 * @param {string} [props.variant] Fill: `primary`, `normal`, `muted`, `chip`, `danger`, `destructive`, or `bare` for none.
 * @param {string} [props.size] Recurring dimensions: `small`/`action`/`submit` rows, `icon`/`iconChip`/`iconLarge` squares, or `none`.
 * @param {string} [props.text] The button's label, when that is all it holds.
 * @param {boolean} [props.loading] Shows the spinner ahead of the label, and disables the button.
 * @param {boolean} [props.dim] Fades the button while it is disabled.
 * @param {boolean} [props.fullWidth] Stretches the button to the container width.
 * @param {ReactNode} [props.leftIcon] Rendered before the label.
 * @param {ReactNode} [props.rightIcon] Rendered after the label.
 * @param {string} [props.className] Extra classes; conflicting utilities override the variant's.
 * @returns {JSX.Element} The button.
 */
export default function Button({ variant = 'bare', size = 'none', text, loading = false, dim = false, fullWidth = false, leftIcon, rightIcon, className = '', type = 'button', disabled = false, children, ...rest }: { variant?: keyof typeof variantMap; size?: keyof typeof sizeMap; text?: string; loading?: boolean; dim?: boolean; fullWidth?: boolean; leftIcon?: ReactNode; rightIcon?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>)
{
    const inactive = disabled || loading;

    return (
        <button
            type={ type }
            disabled={ inactive }
            aria-busy={ loading || undefined }
            className={ cn(variant !== 'bare' && 'flex items-center justify-center gap-2 disabled:cursor-not-allowed!', variantMap[variant], sizeMap[size], fullWidth && 'w-full', dim && 'disabled:opacity-60', className) }
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
