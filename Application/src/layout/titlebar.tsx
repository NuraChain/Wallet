import { useCallback } from 'react';
import { LuTvMinimal } from 'react-icons/lu';
import { useIsWindows } from '../hook/platform';
import { AiOutlineMobile } from 'react-icons/ai';
import { VscChromeClose, VscChromeMinimize } from 'react-icons/vsc';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

import Button from '../components/ui/button';

import { T } from '../utility/language';

import Logo from '../assets/image/logo.svg';

/**
 * TitleBar - Custom window chrome for frameless desktop windows.
 *
 * The window is created with `decorations: false`, so the app has to provide its own drag region and window controls.
 *
 * The bar keeps a fixed `ltr` direction so the controls stay where a Windows user expects them, regardless of the active UI language.
 * @returns {JSX.Element} The title bar element.
 */
export default function TitleBar()
{
    const isWindows = useIsWindows();

    const onMinimize = useCallback(() =>
    {
        void getCurrentWindow().minimize();
    }, [ ]);

    const onMaximize = useCallback(() =>
    {
        void getCurrentWindow().maximize();
    }, [ ]);

    const onToggleMaximize = useCallback(() =>
    {
        void getCurrentWindow().toggleMaximize();
    }, [ ]);

    const onMobileView = useCallback(() =>
    {
        void getCurrentWindow().setSize(new LogicalSize(360, 640));
    }, [ ]);

    const onClose = useCallback(() =>
    {
        void getCurrentWindow().hide();
    }, [ ]);

    if (!isWindows)
    {
        return undefined;
    }

    /**
     * The window controls, in visual order. Every control is the same 40px hover square; only the
     * glyph and the action differ, so the row is data rather than four copies of the same button.
     */
    const controlMap =
    [
        { key: 'minimize', icon: <VscChromeMinimize size={ 16 } />, action: onMinimize },
        { key: 'mobile', icon: <AiOutlineMobile size={ 16 } />, action: onMobileView },
        { key: 'maximize', icon: <LuTvMinimal size={ 16 } />, action: onMaximize },
        { key: 'close', icon: <VscChromeClose size={ 16 } />, action: onClose }
    ];

    return (
        <div
            data-tauri-drag-region
            onDoubleClick={ onToggleMaximize }
            className='absolute inset-x-0 z-20 flex h-8 cursor-pointer items-center justify-between'>

            <div className='flex items-center gap-2 px-2'>

                <img
                    src={ Logo }
                    className='size-4' />

                <div className='text-tiny text-txt-normal'>

                    {
                        T('App.Name')
                    }

                </div>

            </div>

            <div className='flex h-full'>

                {
                    controlMap.map((item) => (
                        <Button
                            key={ item.key }
                            onClick={ item.action }
                            className='flex h-full w-10 cursor-pointer items-center justify-center text-txt-normal duration-200 hover:bg-btn-muted-hover active:bg-btn-muted-active'>

                            { item.icon }

                        </Button>
                    ))
                }

            </div>

        </div>
    );
}
