import { emit, on, off } from '../utility/event';

let online = navigator.onLine;

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

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        apply(navigator.onLine);
    }
});

export const isOnline = () => online;

export const subscribeConnection = (listener: () => void) => {
    on('Connection.Change', listener);

    return () => {
        off('Connection.Change', listener);
    };
};
