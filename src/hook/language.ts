import { useSyncExternalStore } from 'react';

import { subscribeLanguage, getLanguageCode, type LanguageType } from '../utility/language';

/**
 * Re-render the calling component whenever the active language changes.
 *
 * The language is a module singleton rather than context, so a component that calls `T()` renders
 * the strings that were loaded at the time and has no reason to render again. That is enough almost
 * everywhere, because the picker is a modal and closing it re-renders the page beneath it. It is not
 * enough for anything mounted outside that page — see `TitleBar`.
 *
 * `useSyncExternalStore` rather than an effect and a counter: the code is already the store's
 * snapshot, so React can skip the render when it has not actually changed, and the subscription is
 * torn down with the component.
 * @returns {LanguageType} The active language code, changing identity only when the language does.
 */
export const useLanguage = (): LanguageType => useSyncExternalStore(subscribeLanguage, getLanguageCode);
