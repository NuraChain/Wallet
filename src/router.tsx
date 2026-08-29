import { createMemoryRouter, redirect } from 'react-router';

import RootLayout, { RouteFallback } from './layout/root';
import RouteError, { NotFound } from './layout/route.error';

import { getVault } from './core/session';
import { getValue } from './utility/storage';

/**
 * launchLoader - Decides which screen the app opens on, before anything renders.
 *
 * This was an effect inside the root component that read storage and then called `openPage`, which
 * meant the shell mounted, rendered nothing, and only then learned where it was going. As a loader it
 * runs before the route renders, so the first paint is already the right screen.
 *
 * The two reads go together rather than one after the other. Each is a Tauri IPC round-trip, and they
 * are independent — awaiting them in sequence cost two round-trips of latency on the launch path to
 * answer one question.
 *
 * Read defensively: a storage failure must not leave the window empty. The intro is the safe landing,
 * because it cannot destroy a wallet that is still on disk — it only offers to create or import one.
 * @returns {Promise<Response>} A redirect to the unlock screen when a wallet exists, else to the intro.
 */
const launchLoader = async () => {
    const [mnemonic, password] = await Promise.all([getValue('Wallet.Mnemonic').catch(() => undefined), getValue('Wallet.Password').catch(() => undefined)]);

    const stored = mnemonic !== undefined && mnemonic.length > 0 && password !== undefined && password.length > 0;

    return redirect(stored ? '/unlock' : '/intro');
};

/**
 * dashboardLoader - The lock guard.
 *
 * The dashboard is only meaningful with a decrypted vault in memory, and the vault is dropped by the
 * lock button and by logout. Without this, history is a way around the lock screen: locking navigates
 * away from `/dashboard` but leaves that entry behind, and going back would re-render the wallet from
 * a vault that is no longer there.
 *
 * Checked in a loader rather than in the component so the redirect happens before the route renders —
 * no flash of a dashboard that is about to be taken away.
 * @returns {Response | null} A redirect to the launch route when locked, otherwise nothing.
 */
const dashboardLoader = () => (getVault() === undefined ? redirect('/') : null);

/**
 * The application's routes.
 *
 * **A memory router, not a browser one.** There is no address bar in a Tauri window, so a URL buys
 * nothing here — and `createBrowserRouter` would write every screen into the WebView's session history
 * and leave the app on `tauri.localhost/dashboard` after a reload, which is a route the app cannot
 * serve. Keeping the history in memory also means no navigation state is written anywhere the process
 * does not own.
 *
 * Each page is `lazy`, so the entry chunk holds the shell and nothing else. This matters most for the
 * dashboard: it is the only screen that touches `ethers`, and pulling that in on demand keeps roughly
 * 370 KB of crypto off the launch path entirely.
 */
export const router = createMemoryRouter([
    {
        path: '/',
        Component: RootLayout,
        ErrorBoundary: RouteError,
        HydrateFallback: RouteFallback,
        children: [
            {
                index: true,
                loader: launchLoader,
                Component: RouteFallback
            },
            {
                path: 'intro',
                lazy: { Component: async () => (await import('./page/intro')).default }
            },
            {
                path: 'unlock',
                lazy: { Component: async () => (await import('./page/unlock')).default }
            },
            {
                path: 'dashboard',
                loader: dashboardLoader,
                lazy: { Component: async () => (await import('./page/dashboard')).default }
            },
            {
                path: '*',
                Component: NotFound
            }
        ]
    }
]);
