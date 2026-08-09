import { AnimatePresence } from 'motion/react';
import { useEffect, useState, type JSX } from 'react';

import { on, off } from '../utility/event';

/**
 * PageLayout - Hosts the global page stack.
 *
 * The layout listens to the shared event bus and renders every active page component in insertion order.
 *
 * @returns {JSX.Element | undefined} The page stack container, or `undefined` when empty.
 */
export default function PageLayout()
{
    const [ layoutMap, setLayoutMap ] = useState<JSX.Element>();

    useEffect(() =>
    {
        /**
         * OpenHandler - Appends a page component to the active stack.
         * @param {JSX.Element} component - The page element to render.
         */
        const openHandler = (component: JSX.Element) =>
        {
            setLayoutMap(component);
        };

        on('Page.Open', openHandler);

        return () =>
        {
            off('Page.Open', openHandler);
        };
    }, [ ]);

    return (
        <AnimatePresence>

            { layoutMap }

        </AnimatePresence>
    );
}
