import { RouterProvider } from 'react-router';
import { createRoot } from 'react-dom/client';

import ErrorBoundary from './layout/boundary';

import { router } from './router';
import { initTheme } from './utility/theme';
import { initNetwork } from './core/network';
import { initLanguage } from './utility/language';

import './assets/style.css';

/**
 * Prevent browser-default shortcuts and context menu actions that conflict with the desktop app experience.
 */
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
        event.preventDefault();
    }
});

document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

/**
 * Applies the three stored preferences before the first render, and lets none of them cost the window.
 *
 * These were awaited one after another at module scope, where a single rejection left the module
 * unresolved: no render, no error, a blank window and nothing anywhere saying why. They are independent
 * of each other and each already falls back to a default of its own — the OS colour scheme, English,
 * the first built-in network — so they settle together and a failure is reported rather than fatal.
 *
 * None of them touches the network. That is deliberate and worth keeping: the app must open with no
 * connection at all, and anything added here that waits on a remote answer would make the launch itself
 * depend on one.
 *
 * Which screen to open on is *not* decided here any more — that is the index route's loader, so the
 * decision and the render happen together instead of the shell mounting empty and being told after.
 * @returns {Promise<void>} Resolves once every preference has been applied or given up on.
 */
const startup = async () => {
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

    // Wrapped rather than rendered bare: the router has its own per-route error element, which keeps
    // the shell standing when a page throws, but nothing inside the router can catch the router — or
    // the shell — failing. That is what this is still here for.
    const application = (
        <ErrorBoundary>
            <RouterProvider router={router} />
        </ErrorBoundary>
    );

    createRoot(rootElement).render(application);
}
