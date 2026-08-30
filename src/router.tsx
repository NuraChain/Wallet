import { createMemoryRouter, redirect } from 'react-router';

import RootLayout, { RouteFallback } from './layout/root';
import RouteError, { NotFound } from './layout/route.error';

import { getVault } from './core/session';
import { getValue } from './utility/storage';

const launchLoader = async () => {
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
