import { RouterProvider } from 'react-router';
import { createRoot } from 'react-dom/client';

import ErrorBoundary from '../src/layout/boundary';

import { initTheme } from '../src/utility/theme';
import { initNetwork } from '../src/core/network';
import { restoreSession, touchSession } from '../src/core/session';
import { initLanguage, preloadLanguageFlags } from '../src/utility/language';

import { keepOneSurface } from './platform.ts';

import '../src/assets/style.css';

const startup = async () => {
    void preloadLanguageFlags();

    const results = await Promise.allSettled([restoreSession(), initTheme(), initLanguage(), initNetwork()]);

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

    // The lock deadline measures idle time, so input extends it, at most once a minute.
    touchSession();

    let touched = Date.now();

    const stillHere = () => {
        if (Date.now() - touched > 60_000) {
            touched = Date.now();

            touchSession();
        }
    };

    document.addEventListener('pointerdown', stillHere, { capture: true, passive: true });
    document.addEventListener('keydown', stillHere, { capture: true, passive: true });

    keepOneSurface();

    // Not hoisted: the router's first loader must run after restoreSession(), or it asks for the password again.
    const { router } = await import('../src/router');

    createRoot(rootElement).render(
        <ErrorBoundary>
            <RouterProvider router={router} />
        </ErrorBoundary>
    );
}
