import { LuTvMinimal } from 'react-icons/lu';
import { useIsWindows } from '../hook/platform';
import { AiOutlineMobile } from 'react-icons/ai';
import { useCallback, useState } from 'react';
import { VscChromeClose, VscChromeMinimize } from 'react-icons/vsc';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

import Button from '../components/ui/button';

import { T } from '../utility/language';

import Logo from '../assets/image/logo.svg';

/**
 * Size the mobile view snaps back to: the phone-shaped frame the layout is designed around, and what
 * the Android build actually runs at.
 */
const mobileSize = { width: 360, height: 640 };

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

    const [ wide, setWide ] = useState(false);

    const onMinimize = useCallback(() =>
    {
        void getCurrentWindow().minimize();
    }, [ ]);

    /**
     * onToggleSize - Swaps the window between filling the desktop and the phone-shaped frame.
     *
     * Deliberately sizes the window rather than calling `maximize`. On this frameless window Tauri's
     * `unmaximize` and `toggleMaximize` do not take effect — verified by driving both: the window
     * maximizes and then will not come back, while the OS's own restore does. Entering that state at
     * all is therefore a trap, so neither this control nor the double-click below ever does.
     *
     * `screen.availWidth/Height` is the desktop minus the taskbar, in the same CSS pixels
     * `LogicalSize` takes, so the wide state lands where a maximized window would.
     */
    const onToggleSize = useCallback(() =>
    {
        const run = async() =>
        {
            const current = getCurrentWindow();
            const next = !wide;

            await current.setSize(next ?
                new LogicalSize(window.screen.availWidth, window.screen.availHeight) :
                new LogicalSize(mobileSize.width, mobileSize.height));

            await current.center();

            setWide(next);
        };

        void run();
    }, [ wide ]);

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
     * glyph and the action differ, so the row is data rather than three copies of the same button.
     *
     * The middle one is a single toggle rather than a pair: maximize and mobile view are two ends of
     * one choice, and only one of them is ever the useful next step. It shows the state it would
     * move to, so the phone glyph appears once the window is maximized.
     */
    const controlMap =
    [
        { key: 'minimize', icon: <VscChromeMinimize size={ 16 } />, action: onMinimize },
        { key: 'size', icon: wide ? <AiOutlineMobile size={ 16 } /> : <LuTvMinimal size={ 16 } />, action: onToggleSize },
        { key: 'close', icon: <VscChromeClose size={ 16 } />, action: onClose }
    ];

    return (
        <div
            data-tauri-drag-region
            onDoubleClick={ onToggleSize }
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
