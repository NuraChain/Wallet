import { Monitor, Smartphone, X, Minus } from 'lucide-react';
import { useHasTitleBar, useIsWindows } from '../hook/platform';
import { useLanguage } from '../hook/language';
import { useCallback, useState } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

import Text from '../components/ui/text';

import { layer } from './container';
import Button from '../components/ui/button';

import { platform } from '../platform';
import { T } from '../utility/language';

import Logo from '../assets/image/logo.png';
import { Horizontal } from '../components/ui/stack';

const mobileSize = { width: 360, height: 640 };

/**
 * The strip the wallet draws where the host draws nothing. On Windows that is a Tauri window with
 * its decorations turned off, and the bar carries the whole set. In an extension it is a side
 * panel or a popup — a frame the browser sizes and the wallet cannot move — so the only control
 * that means anything there is the way out.
 */
export default function TitleBar() {
    const isWindows = useIsWindows();

    const hasTitleBar = useHasTitleBar();

    useLanguage();

    const [wide, setWide] = useState(false);

    const onMinimize = useCallback(() => {
        void getCurrentWindow().minimize();
    }, []);

    const onToggleSize = useCallback(() => {
        const run = async () => {
            const current = getCurrentWindow();
            const next = !wide;

            await current.setSize(
                next ? new LogicalSize(window.screen.availWidth, window.screen.availHeight) : new LogicalSize(mobileSize.width, mobileSize.height)
            );

            await current.center();

            setWide(next);
        };

        void run();
    }, [wide]);

    const onClose = useCallback(() => {
        if (isWindows) {
            void getCurrentWindow().hide();

            return;
        }

        // An extension document has no window of its own to hide: the frame it is drawn in belongs
        // to the browser, and the platform is what knows which one to ask.
        platform.panel.close();
    }, [isWindows]);

    if (!hasTitleBar) {
        return undefined;
    }

    const close = { key: 'close', label: T('App.Window.Close'), icon: <X size={16} />, action: onClose };

    const controlMap = isWindows
        ? [
              { key: 'minimize', label: T('App.Window.Minimize'), icon: <Minus size={16} />, action: onMinimize },
              { key: 'size', label: T('App.Window.Maximize'), icon: wide ? <Smartphone size={16} /> : <Monitor size={16} />, action: onToggleSize },
              close
          ]
        : [close];

    return (
        <div
            dir='ltr'
            {...(isWindows ? { 'data-tauri-drag-region': true, onDoubleClick: onToggleSize } : {})}
            className={`absolute inset-x-0 ${layer.chrome} flex h-8 items-center justify-between ${isWindows ? 'cursor-pointer' : ''}`}
        >
            <Horizontal className='items-center gap-2 px-2'>
                <img src={Logo} alt='' className='size-4' />

                <Text variant='captionStrong' text={T('App.Name')} />
            </Horizontal>

            <Horizontal className='h-full'>
                {controlMap.map((item) => (
                    <Button
                        key={item.key}
                        aria-label={item.label}
                        onClick={item.action}
                        className='flex h-full w-10 cursor-pointer items-center justify-center text-txt-normal transition-colors duration-(--duration-base) hover:bg-btn-muted-hover active:bg-btn-muted-active'
                    >
                        {item.icon}
                    </Button>
                ))}
            </Horizontal>
        </div>
    );
}
