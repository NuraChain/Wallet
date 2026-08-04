import { useEffect, useState } from 'react';

import { imageCache, type ImageKind } from '../core/image';

/**
 * Resolve a remote image through the cache and hand back something an `img` can show.
 *
 * The empty string is the honest answer while a lookup is running and after one that found nothing, so
 * a caller has one thing to test rather than a loading flag and a value. Nothing here blocks a render:
 * the first pass returns empty, the icon draws its fallback, and the resolved URL arrives in a later
 * one — which is also why a list of a hundred rows costs nothing at mount.
 *
 * A lookup that finishes after the component has moved on is dropped rather than applied, so a row
 * recycled onto a different token cannot end up wearing the previous one's logo.
 * @param {string} url The image address; an empty string resolves to an empty string.
 * @param {ImageKind} [kind] What sort of image it is, which sets how long it stays fresh.
 * @returns {string} A URL to display, or an empty string when there is nothing to show.
 */
export const useCachedImage = (url: string, kind: ImageKind = 'unknown') =>
{
    const [ source, setSource ] = useState('');

    useEffect(() =>
    {
        let live = true;

        setSource('');

        if (url.length === 0)
        {
            return undefined;
        }

        void imageCache.get(url, kind).then((value) =>
        {
            if (live)
            {
                setSource(value);
            }
        });

        return () =>
        {
            live = false;
        };
    }, [ url, kind ]);

    return source;
};
