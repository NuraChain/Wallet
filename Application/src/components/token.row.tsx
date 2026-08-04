import type { ReactNode } from 'react';

import Text from './ui/text';
import TokenIcon from './token.icon';

import type { ImageKind } from '../core/image';

import { cn } from '../utility/cn';
import { glassPanel } from './ui/panel';

/**
 * TokenRow - An asset as a list row: logo, symbol over name, and whatever the list puts on the end.
 *
 * The wallet tab draws it as a glass card with the balance and value stacked on the end; the token
 * manager draws it flat with the balance and a remove control. Both are the same row — the end
 * content comes in as children so each list keeps its own.
 * @param {object} props Component props.
 * @param {string} props.src Logo URL, handed to `TokenIcon`.
 * @param {ImageKind} [props.kind] What sort of image the logo is, which sets how long the cache keeps it.
 * @param {string} props.symbol Asset symbol, used for the icon fallback and as the title.
 * @param {boolean} [props.primary] Tints the icon fallback with the primary colour.
 * @param {string} props.subtitle Muted line under the title.
 * @param {boolean} [props.panel] Draws the row as a glass card.
 * @param {boolean} [props.hover] Picks the row out under the pointer.
 * @param {ReactNode} [props.children] End-of-row content.
 * @returns {JSX.Element} The row.
 */
export default function TokenRow({ src, symbol, kind = 'unknown', primary = false, subtitle, panel = false, hover = false, children }: { src: string; symbol: string; kind?: ImageKind; primary?: boolean; subtitle: string; panel?: boolean; hover?: boolean; children?: ReactNode })
{
    return (
        // Asked for rather than always on: these rows are a list to read in the wallet tab, where a
        // surface that lights up under the pointer promises a click that does not happen. In the token
        // manager each one carries its own remove control, so saying which row the pointer is on is
        // the difference between removing that token and its neighbour. `btn-muted-hover` is the same
        // fill the nav tab and the window controls use, so nothing new is painted here.
        <div className={ cn('flex items-center gap-3 rounded-xl', panel ? `${ glassPanel } p-3` : 'p-2', hover && 'transition-[background-color] duration-200 ease-initial hover:bg-btn-muted-hover') }>

            <TokenIcon
                src={ src }
                kind={ kind }
                symbol={ symbol }
                primary={ primary } />

            <div className='flex min-w-0 flex-1 flex-col'>

                <Text
                    variant='body'
                    className='truncate'
                    text={ symbol } />

                <Text
                    className='truncate'
                    text={ subtitle } />

            </div>

            { children }

        </div>
    );
}
