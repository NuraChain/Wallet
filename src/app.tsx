import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { TrayIcon } from '@tauri-apps/api/tray';
import { defaultWindowIcon } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Menu, type MenuOptions } from '@tauri-apps/api/menu';

import PageLayout from './layout/page';
import TitleBar from './layout/titlebar';
import ErrorBoundary from './layout/boundary';

import IntroPage from './page/intro';
import UnlockPage from './page/unlock';

import { initTheme } from './utility/theme';
import { initNetwork } from './core/network';
import { getValue } from './utility/storage';
import { openPage } from './utility/context';
import { useIsWindows } from './hook/platform';
import { T, initLanguage } from './utility/language';

import './assets/style.css';
import { Horizontal } from './components/ui/stack';

/**
 * Root application.
 *
 * Responsibilities:
 * - Register global browser-event guards that should apply to the whole app.
 * - Open the first page so the UI has content as soon as the shell mounts.
 * @returns {JSX.Element} The root application component
 */
function Application()
{
    const isWindows = useIsWindows();

    useEffect(() =>
    {
        const init = async() =>
        {
            // Read defensively: a storage failure here would leave the page bus with nothing to render
            // and the window empty. The intro is the safe landing — it cannot destroy a wallet that is
            // still on disk, it only offers to create or import one.
            const mnemonic = await getValue('Wallet.Mnemonic').catch(() => undefined);
            const password = await getValue('Wallet.Password').catch(() => undefined);

            if (mnemonic !== undefined && mnemonic.length > 0 && password !== undefined && password.length > 0)
            {
                openPage(UnlockPage);

                return;
            }

            openPage(IntroPage);
        };

        void init();

        const windowsTray = async() =>
        {
            const appIcon = await defaultWindowIcon();

            if (appIcon)
            {
                const trayMenuOption: MenuOptions =
                {
                    items: [
                        {
                            id: 'open',
                            text: T('App.Tray.Open'),
                            action: () =>
                            {
                                void getCurrentWindow().show();
                            }
                        },
                        {
                            id: 'quit',
                            text: T('App.Tray.Quit'),
                            action: () =>
                            {
                                void getCurrentWindow().close();
                            }
                        }
                    ]
                };

                const trayMenu = await Menu.new(trayMenuOption);

                await TrayIcon.new({ tooltip: T('App.Name'), menu: trayMenu, icon: appIcon, showMenuOnLeftClick: false });
            }
        };

        if (isWindows)
        {
            // The tray is a nicety and its plugin can refuse — a rejection here used to be an unhandled
            // one, which is a crash report the user never sees and a window that opened anyway.
            void windowsTray().catch((cause: unknown) =>
            {
                // eslint-disable-next-line no-console
                console.error('[tray]', cause);
            });
        }
    }, [ ]);

    return (
        <Horizontal className='relative size-full'>

            <TitleBar />

            <PageLayout />

        </Horizontal>
    );
}

/**
 * Prevent browser-default shortcuts and context menu actions that conflict with the desktop app experience.
 */
document.addEventListener('keydown', (event) =>
{
    if (event.key === 'F3' ||
        event.key === 'F5' ||
        event.key === 'F7' ||
        event.key === 'F12' ||
        (event.ctrlKey && (event.key === 'u' || event.key === 'U')) ||
        (event.ctrlKey && (event.key === 'p' || event.key === 'P')) ||
        (event.ctrlKey && (event.key === 'j' || event.key === 'J')) ||
        (event.ctrlKey && (event.key === 'r' || event.key === 'R')) ||
        (event.ctrlKey && (event.key === 'f' || event.key === 'F')) ||
        (event.ctrlKey && event.shiftKey && (event.key === 'p' || event.key === 'P')) ||
        (event.ctrlKey && event.shiftKey && (event.key === 'i' || event.key === 'I')))
    {
        // event.preventDefault();
    }
});

document.addEventListener('contextmenu', (event) =>
{
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
 * @returns {Promise<void>} Resolves once every preference has been applied or given up on.
 */
const startup = async() =>
{
    const results = await Promise.allSettled([ initTheme(), initLanguage(), initNetwork() ]);

    for (const result of results)
    {
        if (result.status === 'rejected')
        {
            // eslint-disable-next-line no-console
            console.error('[startup]', result.reason);
        }
    }
};

const rootElement = document.querySelector('#root');

if (rootElement)
{
    await startup();

    // Wrapped rather than rendered bare: a component throwing during render unmounts the whole tree,
    // and on a desktop app that is an empty window with no way back and nothing said.
    const application = (
        <ErrorBoundary>

            <Application />

        </ErrorBoundary>
    );

    createRoot(rootElement).render(application);
}
