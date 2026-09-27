import { RouterProvider } from 'react-router';
import { createRoot } from 'react-dom/client';

import ErrorBoundary from '../src/layout/boundary';

import { initTheme } from '../src/utility/theme';
import { initNetwork } from '../src/core/network';
import { restoreSession, touchSession } from '../src/core/session';
import { initLanguage, preloadLanguageFlags } from '../src/utility/language';

import { keepOneSurface } from './platform.ts';

import '../src/assets/style.css';

/**
 * The app's own entry, minus the two things that only mean something inside a Tauri window: the
 * safe-area insets an Android WebView publishes, and the `nurawallet://` deep link handler, which
 * an extension cannot register a scheme for. The devtools key suppressors go too — in a browser
 * the user's own shortcuts are not ours to take.
 */
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

    // Opening the wallet is the user saying they are still here, and so is every press and key
    // after that: the deadline measures idle time, and a panel left open used to lock on someone
    // mid-use fifteen minutes after it opened. One write a minute is plenty against fifteen.
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

    // Imported here rather than at the top of the file: creating the router runs the first loader
    // straight away, and that loader asks whether a session was restored — a question with only one
    // answer while the line above it has not run yet. Hoisting the import is what made the panel
    // ask for a password it already had.
    const { router } = await import('../src/router');

    createRoot(rootElement).render(
        <ErrorBoundary>
            <RouterProvider router={router} />
        </ErrorBoundary>
    );
}
