import { useState } from 'react';

import IconBox from './ui/iconbox';

import { cn } from '../utility/cn';
import { useCachedImage } from '../hook/image';

import type { ImageKind } from '../core/image';

/**
 * TokenIcon - Remote asset logo with a lettered fallback.
 *
 * Logos are pulled from a public CDN, so anything the CDN does not carry (a brand-new contract, an offline device) has to degrade gracefully — the first load error swaps in the symbol's initial on a coloured disc, which is what the list used before icons existed.
 *
 * The address is never handed to the browser directly. It goes through the image cache, which answers from memory, then from disk, and only then from the network — so the same logo across the holdings list, the send picker and the network picker is fetched once, survives a restart, and shows instantly the second time. This is the only component in the app that renders a remote image, which is what makes that a complete statement rather than a hopeful one.
 *
 * While the lookup runs, and after one that found nothing, the fallback letter is what shows. That covers the offline case for free: no request, no broken frame, just the initial.
 * @param {object} props Component props.
 * @param {string} props.src Remote logo URL; an empty string skips straight to the fallback.
 * @param {string} props.symbol Asset symbol, used for the fallback letter and the alt text.
 * @param {ImageKind} [props.kind] What sort of image this is, which sets how long the cache keeps it.
 * @param {boolean} [props.primary] Tints the fallback with the primary colour instead of the secondary one.
 * @param {string} [props.className] Sizing classes for the disc.
 * @returns {JSX.Element} The icon.
 */
export default function TokenIcon({ src, symbol, kind = 'unknown', primary = false, className = 'size-9' }: { src: string; symbol: string; kind?: ImageKind; primary?: boolean; className?: string })
{
    const [ failed, setFailed ] = useState(false);

    const resolved = useCachedImage(src, kind);

    if (resolved.length === 0 || failed)
    {
        // The lettered disc is `IconBox` and always was — this component had copied its three
        // classes rather than importing it, which is the whole reason `tone='secondary'` read as a
        // tone nothing used.
        return (
            <IconBox
                tone={ primary ? 'primary' : 'secondary' }
                className={ cn('text-small', className) }>

                { symbol.slice(0, 1) }

            </IconBox>
        );
    }

    return (
        <img
            src={ resolved }
            alt={ symbol }
            loading='lazy'
            decoding='async'
            onError={ () => { setFailed(true); } }
            className={ cn('shrink-0 rounded-control bg-base-3 object-contain', className) } />
    );
}
