import { createMemoryRouter, redirect } from 'react-router';

import RootLayout, { RouteFallback } from './layout/root';
import RouteError, { NotFound } from './layout/route.error';

import IntroPage from './page/intro';
import UnlockPage from './page/unlock';
import DashboardPage from './page/dashboard';

import { getVault } from './core/session';
import { getValue } from './utility/storage';

const launchLoader = async () => {
    // A session the platform kept for us: the wallet is already open, and the unlock screen would
    // be asking for a passphrase it does not need.
    if (getVault() !== undefined) {
        return redirect('/dashboard');
    }

    const [mnemonic, password] = await Promise.all([getValue('Wallet.Mnemonic').catch(() => undefined), getValue('Wallet.Password').catch(() => undefined)]);

    const stored = mnemonic !== undefined && mnemonic.length > 0 && password !== undefined && password.length > 0;

    return redirect(stored ? '/unlock' : '/intro');
};

const dashboardLoader = () => (getVault() === undefined ? redirect('/') : null);

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
                Component: IntroPage
            },
            {
                path: 'unlock',
                Component: UnlockPage
            },
            {
                path: 'dashboard',
                loader: dashboardLoader,
                Component: DashboardPage
            },
            {
                path: '*',
                Component: NotFound
            }
        ]
    }
]);
