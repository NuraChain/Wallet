import { Monitor, Smartphone, X, Minus } from 'lucide-react';
import { useIsWindows } from '../hook/platform';
import { useLanguage } from '../hook/language';
import { useCallback, useState } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

import Text from './text';

import { layer } from './container';
import Button from './button';

import { T } from '../utility/language';

import Logo from '../assets/image/logo.png';
import { Horizontal } from './stack';

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
        { key: 'minimize', icon: <Minus size={16} />, action: onMinimize },
        { key: 'size', icon: wide ? <Smartphone size={16} /> : <Monitor size={16} />, action: onToggleSize },
        { key: 'close', icon: <X size={16} />, action: onClose }
    ];

    return (
        <div
            dir='ltr'
            data-tauri-drag-region
            onDoubleClick={onToggleSize}
            className={`absolute inset-x-0 ${layer.chrome} flex h-8 cursor-pointer items-center justify-between`}
        >
            <Horizontal align='center' gap={2} px={2}>
                <img src={Logo} alt='' className='size-4' />

                <Text variant='captionStrong' text={T('App.Name')} />
            </Horizontal>

            <Horizontal fill='height'>
                {controlMap.map((item) => (
                    <Button key={item.key} onClick={item.action} variant='window' icon={item.icon} />
                ))}
            </Horizontal>
        </div>
    );
}
