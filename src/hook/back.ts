import { useEffect, useEffectEvent } from 'react';

import { pushBack } from '../utility/back';

/** Android's back button, answered while this component is mounted; return true when it took the press. */
export const useBack = (handler: () => boolean) => {
    const answer = useEffectEvent(handler);

    useEffect(() => pushBack(() => answer()), []);
};
