import type { ReactNode } from 'react';

import TokenIcon from './token.icon';

import { cn } from '../utility/cn';

/**
 * TokenRow - An asset as a list row: logo, symbol over name, and whatever the list puts on the end.
 *
 * The wallet tab draws it as a glass card with the balance and value stacked on the end; the token
 * manager draws it flat with the balance and a remove control. Both are the same row — the end
 * content comes in as children so each list keeps its own.
 * @param {object} props Component props.
 * @param {string} props.src Logo URL, handed to `TokenIcon`.
 * @param {string} props.symbol Asset symbol, for the icon fallback and the title.
 * @param {boolean} [props.primary] Tints the icon fallback with the primary colour.
 * @param {string} [props.title] Title line; defaults to the symbol.
 * @param {string} props.subtitle Muted line under the title.
 * @param {boolean} [props.panel] Draws the row as a glass card.
 * @param {ReactNode} [props.children] End-of-row content.
 * @returns {JSX.Element} The row.
 */
export default function TokenRow({ src, symbol, primary = false, title = '', subtitle, panel = false, children }: { src: string; symbol: string; primary?: boolean; title?: string; subtitle: string; panel?: boolean; children?: ReactNode })
{
    return (
        <div className={ cn('flex items-center gap-3 rounded-xl', panel ? 'glass-panel p-3' : 'p-2') }>

            <TokenIcon
                src={ src }
                symbol={ symbol }
                primary={ primary } />

            <div className='flex min-w-0 flex-1 flex-col'>

                <div className='truncate text-small text-txt-normal'>

                    { title.length > 0 ? title : symbol }

                </div>

                <div className='truncate text-tiny text-txt-muted'>

                    { subtitle }

                </div>

            </div>

            { children }

        </div>
    );
}
