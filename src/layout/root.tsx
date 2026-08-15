import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { TrayIcon } from '@tauri-apps/api/tray';
import { defaultWindowIcon } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Menu, type MenuOptions } from '@tauri-apps/api/menu';

import TitleBar from './titlebar';
import Spinner from '../components/ui/spinner';

import { T } from '../utility/language';
import { useIsWindows } from '../hook/platform';
import { Horizontal } from '../components/ui/stack';

/**
 * RouteFallback - What fills the content area while a route's chunk is still arriving.
 *
 * Deliberately only the content area: the shell around it is already on screen, so this is the
 * localized loading state rather than a whole-window spinner. On a warm start the chunk is usually
 * resolved within a frame or two and this never paints at all.
 * @returns {JSX.Element} A centered spinner.
 */
export function RouteFallback()
{
    return (
        <div className='flex size-full items-center justify-center bg-base-1'>

            <Spinner />

        </div>
    );
}

/**
 * RootLayout - The application shell, mounted once for the life of the process.
 *
 * Everything that must not be rebuilt by navigation lives here: the frameless-window title bar and the
 * tray registration. Only `Outlet` changes when the route does, which is the whole point of having a
 * layout route — the previous page bus swapped the entire tree on every navigation, so the title bar
 * was torn down and rebuilt on the way from unlock to dashboard.
 *
 * The tray is registered from an effect here rather than at module scope so a refusal from the plugin
 * costs the tray and not the window.
 * @returns {JSX.Element} The shell.
 */
export default function RootLayout()
{
    const isWindows = useIsWindows();

    useEffect(() =>
    {
        if (!isWindows)
        {
            return;
        }

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

        // The tray is a nicety and its plugin can refuse — a rejection here used to be an unhandled
        // one, which is a crash report the user never sees and a window that opened anyway.
        void windowsTray().catch((cause: unknown) =>
        {
            // eslint-disable-next-line no-console
            console.error('[tray]', cause);
        });
    }, [ isWindows ]);

    return (
        <Horizontal className='relative size-full'>

            <TitleBar />

            <Outlet />

        </Horizontal>
    );
}
