import { Monitor, Smartphone, X, Minus } from 'lucide-react';
import { useIsWindows } from '../hook/platform';
import { useLanguage } from '../hook/language';
import { useTint } from '../hook/tint';
import { useCallback, useState } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

import Text from './text';

import { layer } from './container';
import Button from './button';

import { cn } from '../utility/cn';
import { inkOn } from '../utility/color';
import { T } from '../utility/language';

import Logo from '../assets/image/logo.png';
import { Horizontal } from './stack';

const mobileSize = { width: 360, height: 640 };

const inkMap = { dark: 'text-tint-dark', light: 'text-tint-light' } as const;

export default function TitleBar() {
    const isWindows = useIsWindows();

    useLanguage();

    const tint = useTint();

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

    const ink = tint.length > 0 ? inkOn(tint) : undefined;

    /* Over a page in the browser the bar wears the colour that page asks for, the way a browser's
       own does. That colour is the site's and known only once the site has said it, so it is the
       one fill here that is neither a token nor a class: it goes on as a style, and everything
       drawn over it takes one of two fixed inks instead of the theme's. */
    return (
        <div
            dir='ltr'
            data-tauri-drag-region
            onDoubleClick={onToggleSize}
            style={ink === undefined ? undefined : { backgroundColor: tint }}
            className={cn(
                `absolute inset-x-0 ${layer.chrome} flex h-8 cursor-pointer items-center justify-between transition-[background-color] duration-(--duration-base)`,
                ink !== undefined && inkMap[ink]
            )}
        >
            <Horizontal align='center' gap={2} px={2}>
                <img src={Logo} alt='' className='size-4' />

                <Text variant={ink === undefined ? 'captionStrong' : 'inherit'} text={T('App.Name')} />
            </Horizontal>

            <Horizontal fill='height'>
                {controlMap.map((item) => (
                    <Button key={item.key} onClick={item.action} variant={ink === undefined ? 'window' : 'windowTint'} icon={item.icon} />
                ))}
            </Horizontal>
        </div>
    );
}
