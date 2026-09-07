import { platform } from '../platform';

import type { Host } from './platform.type';

export type { Host };

/** The host the app is running on, plus the case of not running on one at all. */
export const getPlatform = (): Host => platform.host();
