import { useEffect, useState } from 'react';

import { imageCache, type ImageKind } from '../core/image';

export const useCachedImage = (url: string, kind: ImageKind = 'unknown') => {
    const [source, setSource] = useState('');

    useEffect(() => {
        let live = true;

        setSource('');

        if (url.length === 0) {
            return undefined;
        }

        void imageCache.get(url, kind).then((value) => {
            if (live) {
                setSource(value.length > 0 ? value : url);
            }
        });

        return () => {
            live = false;
        };
    }, [url, kind]);

    return source;
};
