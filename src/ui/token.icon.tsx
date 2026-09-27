import { useState } from 'react';

import IconBox from './iconbox';

import { cn } from '../utility/cn';
import { useCachedImage } from '../hook/image';

import type { ImageKind } from '../type/token';

const sizeMap = { 5: 'size-5', 7: 'size-7', 8: 'size-8', 9: 'size-9' } as const;

export default function TokenIcon({
    src,
    symbol,
    kind = 'unknown',
    primary = false,
    size = 9,
    glyph
}: {
    src: string;
    symbol: string;
    kind?: ImageKind;
    primary?: boolean;
    size?: keyof typeof sizeMap;
    /** The fallback letter's size, for an icon too small for the default one. */
    glyph?: 'tiny';
}) {
    const [failed, setFailed] = useState(false);

    const resolved = useCachedImage(src, kind);

    if (resolved.length === 0 || failed) {
        return (
            <IconBox tone={primary ? 'primary' : 'secondary'} size={size} glyph={glyph ?? 'small'}>
                {symbol.slice(0, 1)}
            </IconBox>
        );
    }

    return (
        <img
            src={resolved}
            alt={symbol}
            loading='lazy'
            decoding='async'
            onError={() => {
                setFailed(true);
            }}
            className={cn('shrink-0 rounded-control bg-base-3 object-contain', sizeMap[size], glyph === 'tiny' && 'text-tiny')}
        />
    );
}
