import { emit, on, off } from '../utility/event';

/**
 * Whether the device currently reports a network link.
 *
 * This is the one question every remote read in the app asks first, and it exists so that being offline
 * is a *state the UI can render* rather than a pile of timeouts each surface discovers on its own. A
 * balance read against a dead link is not a balance of zero, and a history call that never lands is not
 * an account with no transactions — the difference is the whole point of this module.
 *
 * **It reports a link, not a route.** `navigator.onLine` reads `true` on a captive portal, behind a
 * routeless VPN and through a DNS outage, exactly as noted where the image cache reasons about the same
 * flag. So a `true` here is optimistic and every caller still has to handle its own failure; a `false`
 * is reliable, and it is what lets a read skip a request it already knows the answer to.
 */

let online = navigator.onLine;

/**
 * apply - Records a new belief and announces it, but only when it actually changed.
 * @param {boolean} value What the link now looks like.
 */
const apply = (value: boolean) => {
    if (online === value) {
        return;
    }

    online = value;

    emit('Connection.Change', value);
};

window.addEventListener('online', () => {
    apply(true);
});

window.addEventListener('offline', () => {
    apply(false);
});

// Android suspends the webview with the app in the background, and a link that came and went while it
// was down leaves no event behind to catch up on. Re-reading on the way back is what stops a returning
// user from facing an offline banner over a working connection until something else happens to fire.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        apply(navigator.onLine);
    }
});

/**
 * isOnline - Whether a remote read is worth attempting.
 * @returns {boolean} The current belief about the link.
 */
export const isOnline = () => online;

/**
 * subscribeConnection - Subscribe to link changes, in the shape `useSyncExternalStore` wants.
 * @param {() => void} listener Called after the belief changes.
 * @returns {() => void} Unsubscribes the listener.
 */
export const subscribeConnection = (listener: () => void) => {
    on('Connection.Change', listener);

    return () => {
        off('Connection.Change', listener);
    };
};
