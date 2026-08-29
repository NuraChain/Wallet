import type { ReactNode } from 'react';

import Text from './ui/text';
import TokenIcon from './token.icon';

import type { ImageKind } from '../core/image';

import { cn } from '../utility/cn';
import { surfacePanel } from './ui/panel';
import { Vertical } from './ui/stack';

/**
 * AssetAmount - Balance over its USD worth, on the end of a holdings row.
 *
 * The native coin, every token in the wallet tab and every row of the token manager render this
 * identical pair, so what a holding is worth is written beside it in one shape rather than three. A
 * holding with no resolvable price passes no `value` and the second line is left out entirely, rather
 * than printing a misleading `$0.00`.
 *
 * The block end-aligns both lines. A column of balances that meets at one edge keeps its magnitudes
 * comparable at a glance — where the digits sit is how a list of amounts is scanned — while centred
 * figures float at whatever their own width dictates. `dir='ltr'` pins which physical edge that is:
 * the numbers read left-to-right even in a right-to-left interface.
 * @param {object} props Component props.
 * @param {string} props.amount The balance, already trimmed for display.
 * @param {string} [props.value] The USD worth, when it could be resolved.
 * @returns {JSX.Element} The stacked amount.
 */
export function AssetAmount({ amount, value }: { amount: string; value?: string })
{
    return (
        <Vertical dir='ltr' className='shrink-0 items-end'>

            <Text variant='body' className='font-mono' text={ amount } />

            {
                value !== undefined && <Text className='font-mono' text={ value } />
            }

        </Vertical>
    );
}

/**
 * TokenRow - An asset as a list row: logo, symbol over name, and whatever the list puts on the end.
 *
 * Three placements, one row. Free-standing it draws as a card of its own; inside a `ListCard` the
 * `grouped` mode strips the surface and lets the container carry it, at the padding a divided row
 * wants; flat is the quiet version the token manager's hover rows sit on.
 * @param {object} props Component props.
 * @param {string} props.src Logo URL, handed to `TokenIcon`.
 * @param {ImageKind} [props.kind] What sort of image the logo is, which sets how long the cache keeps it.
 * @param {string} props.symbol Asset symbol, used for the icon fallback and as the title.
 * @param {boolean} [props.primary] Tints the icon fallback with the primary colour.
 * @param {string} props.subtitle Muted line under the title.
 * @param {boolean} [props.panel] Draws the row as its own card.
 * @param {boolean} [props.grouped] Draws the row bare for life inside a `ListCard`.
 * @param {boolean} [props.hover] Picks the row out under the pointer.
 * @param {ReactNode} [props.children] End-of-row content.
 * @returns {JSX.Element} The row.
 */
export default function TokenRow({ src, symbol, kind = 'unknown', primary = false, subtitle, panel = false, grouped = false, hover = false, children }: { src: string; symbol: string; kind?: ImageKind; primary?: boolean; subtitle: string; panel?: boolean; grouped?: boolean; hover?: boolean; children?: ReactNode })
{
    return (
        // Asked for rather than always on: these rows are a list to read in the wallet tab, where a
        // surface that lights up under the pointer promises a click that does not happen. In the token
        // manager each one carries its own remove control, so saying which row the pointer is on is
        // the difference between removing that token and its neighbour. `btn-muted-hover` is the same
        // fill the nav bar and the window controls use, so nothing new is painted here.
        <div className={
            cn(
                'flex items-center gap-3',
                panel ? `${ surfacePanel } rounded-surface p-3` : '',
                grouped ? 'p-3' : '',
                !panel && !grouped ? 'p-2' : '',
                hover && 'transition-colors duration-(--duration-base) ease-initial hover:bg-btn-muted-hover'
            )
        }>

            <TokenIcon
                src={ src }
                kind={ kind }
                symbol={ symbol }
                primary={ primary } />

            <Vertical className='min-w-0 flex-1'>

                <Text
                    variant='body'
                    className='truncate'
                    text={ symbol } />

                <Text
                    className='truncate'
                    text={ subtitle } />

            </Vertical>

            { children }

        </div>
    );
}
