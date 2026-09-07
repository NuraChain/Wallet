import { RouterProvider } from 'react-router';
import { createRoot } from 'react-dom/client';

import ErrorBoundary from '../src/layout/boundary';

import { router } from '../src/router';
import { initTheme } from '../src/utility/theme';
import { initNetwork } from '../src/core/network';
import { restoreSession, touchSession } from '../src/core/session';
import { initLanguage } from '../src/utility/language';

import '../src/assets/style.css';

/**
 * The app's own entry, minus the two things that only mean something inside a Tauri window: the
 * safe-area insets an Android WebView publishes, and the `nurawallet://` deep link handler, which
 * an extension cannot register a scheme for. The devtools key suppressors go too — in a browser
 * the user's own shortcuts are not ours to take.
 */
const startup = async () => {
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

    // Opening the wallet is the user saying they are still here.
    touchSession();

    createRoot(rootElement).render(
        <ErrorBoundary>
            <RouterProvider router={router} />
        </ErrorBoundary>
    );
}
