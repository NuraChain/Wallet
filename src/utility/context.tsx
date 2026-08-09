import type { ComponentType } from 'react';

import { emit } from './event';

/**
 * openPage - Emits a page-open event for the provided component.
 *
 * @template T
 * @param {ComponentType<T>} Component - The page component to render.
 * @param {T} [props] - Props forwarded to the component.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const openPage = <T extends object>(Component: ComponentType<T>, props?: T) =>
{
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    emit('Page.Open', <Component { ...(props ?? { } as T) } />);
};
