import type { UnlistenFn } from '@tauri-apps/api/event';

import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { VscChromeClose, VscChromeMaximize, VscChromeMinimize, VscChromeRestore } from 'react-icons/vsc';

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
    const onMinimize = useCallback(() =>
    {
        void getCurrentWindow().minimize();
    }, [ ]);

    const onToggleMaximize = useCallback(() =>
    {
        void getCurrentWindow().toggleMaximize();
    }, [ ]);

    const onClose = useCallback(() =>
    {
        void getCurrentWindow().hide();
    }, [ ]);

    return (
        <div
            data-tauri-drag-region
            className='z-20 flex h-8 shrink-0 cursor-pointer items-center justify-between'>

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
                    className={ 'flex h-full w-11.5 cursor-pointer items-center justify-center text-txt-normal duration-200 hover:bg-btn-muted-hover active:bg-btn-muted-active' }>

                    <VscChromeMinimize size={ 14 } />

                </button>

                <button
                    type='button'
                    onClick={ onToggleMaximize }
                    className={ 'flex h-full w-11.5 cursor-pointer items-center justify-center text-txt-normal duration-200 hover:bg-btn-muted-hover active:bg-btn-muted-active' }>

                    <VscChromeMaximize size={ 14 } />

                </button>

                <button
                    type='button'
                    onClick={ onClose }
                    className={ 'flex h-full w-11.5 cursor-pointer items-center justify-center text-txt-normal duration-200 hover:bg-[oklch(55%_0.21_25)] hover:text-txt-reverse active:bg-[oklch(55%_0.21_25)] active:text-txt-reverse' }>

                    <VscChromeClose size={ 14 } />

                </button>

            </div>

        </div>
    );
}
