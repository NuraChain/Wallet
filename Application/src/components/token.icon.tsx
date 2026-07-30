import { useState } from 'react';

/**
 * TokenIcon - Remote asset logo with a lettered fallback.
 *
 * Logos are pulled from a public CDN, so anything the CDN does not carry (a brand-new contract, an offline device) has to degrade gracefully — the first load error swaps in the symbol's initial on a coloured disc, which is what the list used before icons existed.
 * @param {object} props Component props.
 * @param {string} props.src Remote logo URL; an empty string skips straight to the fallback.
 * @param {string} props.symbol Asset symbol, used for the fallback letter and the alt text.
 * @param {boolean} [props.primary] Tints the fallback with the primary colour instead of the secondary one.
 * @param {string} [props.className] Sizing classes for the disc.
 * @returns {JSX.Element} The icon.
 */
export default function TokenIcon({ src, symbol, primary = false, className = 'size-9' }: { src: string; symbol: string; primary?: boolean; className?: string })
{
    const [ failed, setFailed ] = useState(false);

    if (src.length === 0 || failed)
    {
        return (
            <div className={ `text-small text-txt-reverse flex shrink-0 items-center justify-center rounded-lg ${ primary ? 'bg-btn-primary' : 'bg-btn-secondary' } ${ className }` }>

                { symbol.slice(0, 1) }

            </div>
        );
    }

    return (
        <img
            src={ src }
            alt={ symbol }
            loading='lazy'
            onError={ () => { setFailed(true); } }
            className={ `bg-base-3 shrink-0 rounded-lg object-contain ${ className }` } />
    );
}
