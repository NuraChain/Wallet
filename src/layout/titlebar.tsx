import { FiMonitor, FiSmartphone } from 'react-icons/fi';
import { useIsWindows } from '../hook/platform';
import { useLanguage } from '../hook/language';
import { useCallback, useState } from 'react';
import { VscChromeClose, VscChromeMinimize } from 'react-icons/vsc';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

import Text from '../components/ui/text';

import { layer } from './container';
import Button from '../components/ui/button';

import { T } from '../utility/language';

import Logo from '../assets/image/logo.png';
import { Horizontal } from '../components/ui/stack';

const mobileSize = { width: 360, height: 640 };

export default function TitleBar() {
    const isWindows = useIsWindows();

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
        void getCurrentWindow().hide();
    }, []);

    if (!isWindows) {
        return undefined;
    }

    const controlMap = [
        { key: 'minimize', label: T('App.Window.Minimize'), icon: <VscChromeMinimize size={16} />, action: onMinimize },
        { key: 'size', label: T('App.Window.Maximize'), icon: wide ? <FiSmartphone size={16} /> : <FiMonitor size={16} />, action: onToggleSize },
        { key: 'close', label: T('App.Window.Close'), icon: <VscChromeClose size={16} />, action: onClose }
    ];

    return (
        <div
            dir='ltr'
            data-tauri-drag-region
            onDoubleClick={onToggleSize}
            className={`absolute inset-x-0 ${layer.chrome} flex h-8 cursor-pointer items-center justify-between`}
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
