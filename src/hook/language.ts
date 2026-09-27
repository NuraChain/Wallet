import { useSyncExternalStore } from 'react';

import { subscribeLanguage, getLanguageCode } from '../utility/language';
import type { LanguageType } from '../type/app';

export const useLanguage = (): LanguageType => useSyncExternalStore(subscribeLanguage, getLanguageCode);
