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
                // Falls back to the address itself when the cache comes back with nothing. The cache
                // reads bytes, so it needs the host's permission to be read cross-origin; an `img` tag
                // does not, and most sites serve their favicon without that header. Cached is still the
                // normal path — this is what stops a site with the icon right there from being drawn as
                // a letter. A URL that is genuinely dead fails the same way it always did, through the
                // icon's own error handler.
                setSource(value.length > 0 ? value : url);
            }
        });

        return () =>
        {
            live = false;
        };
    }, [ url, kind ]);

    return source;
};
