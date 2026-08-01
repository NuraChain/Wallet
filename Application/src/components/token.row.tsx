import type { ReactNode } from 'react';

import Text from './ui/text';
import TokenIcon from './token.icon';

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
 * @param {string} props.symbol Asset symbol, used for the icon fallback and as the title.
 * @param {boolean} [props.primary] Tints the icon fallback with the primary colour.
 * @param {string} props.subtitle Muted line under the title.
 * @param {boolean} [props.panel] Draws the row as a glass card.
 * @param {ReactNode} [props.children] End-of-row content.
 * @returns {JSX.Element} The row.
 */
export default function TokenRow({ src, symbol, primary = false, subtitle, panel = false, children }: { src: string; symbol: string; primary?: boolean; subtitle: string; panel?: boolean; children?: ReactNode })
{
    return (
        <div className={ cn('flex items-center gap-3 rounded-xl', panel ? `${ glassPanel } p-3` : 'p-2') }>

            <TokenIcon
                src={ src }
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
