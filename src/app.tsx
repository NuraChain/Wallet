import { RouterProvider } from 'react-router';
import { createRoot } from 'react-dom/client';

import ErrorBoundary from './layout/boundary';

import { router } from './router';
import { initTheme } from './utility/theme';
import { initInsets } from './utility/inset';
import { startDeepLinks } from './core/deeplink';
import { initNetwork } from './core/network';
import { initLanguage } from './utility/language';

import './assets/style.css';

document.addEventListener('keydown', (event) => {
    if (
        event.key === 'F3' ||
        event.key === 'F5' ||
        event.key === 'F7' ||
        event.key === 'F12' ||
        (event.ctrlKey && (event.key === 'u' || event.key === 'U')) ||
        (event.ctrlKey && (event.key === 'p' || event.key === 'P')) ||
        (event.ctrlKey && (event.key === 'j' || event.key === 'J')) ||
        (event.ctrlKey && (event.key === 'r' || event.key === 'R')) ||
        (event.ctrlKey && (event.key === 'f' || event.key === 'F')) ||
        (event.ctrlKey && event.shiftKey && (event.key === 'p' || event.key === 'P')) ||
        (event.ctrlKey && event.shiftKey && (event.key === 'i' || event.key === 'I'))
    ) {
        //event.preventDefault();
    }
});

document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

const startup = async () => {
    initInsets();

    const results = await Promise.allSettled([initTheme(), initLanguage(), initNetwork()]);

    for (const result of results) {
        if (result.status === 'rejected') {
            // oxlint-disable-next-line no-console
            console.error('[startup]', result.reason);
        }
    }
};

const rootElement = document.querySelector('#root');

if (rootElement) {
    await startup();

    startDeepLinks();

    const application = (
        <ErrorBoundary>
            <RouterProvider router={router} />
        </ErrorBoundary>
    );

    createRoot(rootElement).render(application);
}
