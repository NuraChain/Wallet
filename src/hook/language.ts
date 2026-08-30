import { useSyncExternalStore } from 'react';

import { subscribeLanguage, getLanguageCode, type LanguageType } from '../utility/language';

export const useLanguage = (): LanguageType => useSyncExternalStore(subscribeLanguage, getLanguageCode);
