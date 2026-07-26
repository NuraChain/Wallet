import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { TrayIcon } from '@tauri-apps/api/tray';
import { defaultWindowIcon } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Menu, type MenuOptions } from '@tauri-apps/api/menu';

import PageLayout from './layout/page';
import TitleBar from './layout/titlebar';

import IntroPage from './page/intro';
import UnlockPage from './page/unlock';

import { initTheme } from './utility/theme';
import { initNetwork } from './core/network';
import { getValue } from './utility/storage';
import { openPage } from './utility/context';
import { useIsWindows } from './hook/platform';
import { T, initLanguage } from './utility/language';

import './assets/style.css';

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
            const mnemonic = await getValue('Wallet.Mnemonic');
            const password = await getValue('Wallet.Password');

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
            void windowsTray();
        }
    }, [ ]);

    return (
        <div className='relative flex size-full'>

            <TitleBar />

            <PageLayout />

        </div>
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

const rootElement = document.querySelector('#root');

if (rootElement)
{
    await initTheme();
    await initLanguage();
    await initNetwork();

    createRoot(rootElement).render(<Application />);
}
