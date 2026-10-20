import { platform } from '../platform';

import type { Host } from '../type/platform';

export const getPlatform = (): Host => platform.host();
