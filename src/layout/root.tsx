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
import { useLanguage } from '../hook/language';
import { Horizontal } from '../components/ui/stack';

export function RouteFallback() {
    return (
        <Horizontal className='size-full items-center justify-center bg-base-1'>
            <Spinner />
        </Horizontal>
    );
}

export default function RootLayout() {
    const isWindows = useIsWindows();

    const language = useLanguage();

    useEffect(() => {
        if (!isWindows) {
            return;
        }

        const windowsTray = async () => {
            const appIcon = await defaultWindowIcon();

            if (appIcon) {
                const trayMenuOption: MenuOptions = {
                    items: [
                        {
                            id: 'open',
                            text: T('App.Tray.Open'),
                            action: () => {
                                void getCurrentWindow().show();
                            }
                        },
                        {
                            id: 'quit',
                            text: T('App.Tray.Quit'),
                            action: () => {
                                void getCurrentWindow().close();
                            }
                        }
                    ]
                };

                const trayMenu = await Menu.new(trayMenuOption);

                await TrayIcon.new({ tooltip: T('App.Name'), menu: trayMenu, icon: appIcon, showMenuOnLeftClick: false });
            }
        };

        void windowsTray().catch((cause: unknown) => {
            // oxlint-disable-next-line no-console
            console.error('[tray]', cause);
        });
    }, [isWindows, language]);

    return (
        <Horizontal className='relative size-full'>
            <TitleBar />

            <Outlet />
        </Horizontal>
    );
}
