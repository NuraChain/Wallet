import { useEffect, useState } from 'react';

import { imageCache, type ImageKind } from '../core/image';
import { resolveSiteIcon } from '../core/site.icon';

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

/**
 * The icon a site serves, discovered once per origin. Empty while the lookup runs and for a host
 * that offers nothing, which is what leaves the lettered box on screen instead.
 */
export const useSiteIcon = (url: string) => {
    const [icon, setIcon] = useState('');

    useEffect(() => {
        let live = true;

        setIcon('');

        if (url.length === 0) {
            return undefined;
        }

        void resolveSiteIcon(url).then((value) => {
            if (live) {
                setIcon(value);
            }
        });

        return () => {
            live = false;
        };
    }, [url]);

    return icon;
};
