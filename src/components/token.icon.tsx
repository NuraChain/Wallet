import { useState } from 'react';

import IconBox from './ui/iconbox';

import { cn } from '../utility/cn';
import { useCachedImage } from '../hook/image';

import type { ImageKind } from '../core/image';

export default function TokenIcon({
    src,
    symbol,
    kind = 'unknown',
    primary = false,
    className = 'size-9'
}: {
    src: string;
    symbol: string;
    kind?: ImageKind;
    primary?: boolean;
    className?: string;
}) {
    const [failed, setFailed] = useState(false);

    const resolved = useCachedImage(src, kind);

    if (resolved.length === 0 || failed) {
        return (
            <IconBox tone={primary ? 'primary' : 'secondary'} className={cn('text-small', className)}>
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
            className={cn('shrink-0 rounded-control bg-base-3 object-contain', className)}
        />
    );
}
