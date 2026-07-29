import { useCallback } from 'react';
import { LuTvMinimal } from "react-icons/lu";
import { useIsWindows } from '../hook/platform';
import { AiOutlineMobile } from "react-icons/ai";
import { VscChromeClose, VscChromeMinimize } from 'react-icons/vsc';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

import { T } from '../utility/language';

import Logo from '../assets/image/logo.png';

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
        return;
    }

    return (
        <div
            data-tauri-drag-region
            onDoubleClick={ onToggleMaximize }
            className='absolute z-20 flex h-8 cursor-pointer items-center justify-between left-0 right-0'>

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

                <button
                    type='button'
                    onClick={ onMinimize }
                    className={ 'flex h-full w-10 cursor-pointer items-center justify-center text-txt-normal duration-200 hover:bg-btn-muted-hover active:bg-btn-muted-active' }>

                    <VscChromeMinimize size={ 16 } />

                </button>

                <button
                    type='button'
                    onClick={ onMobileView }
                    className={ 'flex h-full w-10 cursor-pointer items-center justify-center text-txt-normal duration-200 hover:bg-btn-muted-hover active:bg-btn-muted-active' }>

                    <AiOutlineMobile size={ 16 } />

                </button>

                <button
                    type='button'
                    onClick={ onMaximize }
                    className={ 'flex h-full w-10 cursor-pointer items-center justify-center text-txt-normal duration-200 hover:bg-btn-muted-hover active:bg-btn-muted-active' }>

                    <LuTvMinimal size={ 16 } />

                </button>

                <button
                    type='button'
                    onClick={ onClose }
                    className={ 'flex h-full w-10 cursor-pointer items-center justify-center text-txt-normal duration-200 hover:bg-btn-muted-hover active:bg-btn-muted-active' }>

                    <VscChromeClose size={ 16 } />

                </button>

            </div>

        </div>
    );
}
