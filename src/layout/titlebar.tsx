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
 * The bar keeps a fixed `ltr` direction so the controls stay where a Windows user expects them,
 * regardless of the active UI language. That is what the `dir` attribute on the row is for, and it
 * has to be stated: `initLanguage` writes `dir="rtl"` on `<html>` for Persian and Arabic, and a flex
 * row obeys it by reversing its children — which put the close button on the left of the window and
 * the app name on the right. The attribute is inherited, so only an explicit one stops it here.
 * @returns {JSX.Element} The title bar element.
 */
export default function TitleBar()
{
    const isWindows = useIsWindows();

    // Subscribed rather than read: the bar sits beside the page layout, not inside it, so the
    // re-render that closing the language picker gives every other surface never reaches here. The
    // value itself is unused — what is wanted is the render it causes, which re-runs `T()` below.
    useLanguage();

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
    /*
     * The labels are the second half of this map's job. These are three icon-only controls that
     * carried no accessible name at all, while `App.Window.Minimize`, `.Maximize` and `.Close` sat
     * translated in all ten bundles, referenced by nothing.
     */
    const controlMap =
    [
        { key: 'minimize', label: T('App.Window.Minimize'), icon: <VscChromeMinimize size={ 16 } />, action: onMinimize },
        { key: 'size', label: T('App.Window.Maximize'), icon: wide ? <FiSmartphone size={ 16 } /> : <FiMonitor size={ 16 } />, action: onToggleSize },
        { key: 'close', label: T('App.Window.Close'), icon: <VscChromeClose size={ 16 } />, action: onClose }
    ];

    return (
        <div
            dir='ltr'
            data-tauri-drag-region
            onDoubleClick={ onToggleSize }
            className={ `absolute inset-x-0 ${ layer.chrome } flex h-8 cursor-pointer items-center justify-between` }>

            <Horizontal className='items-center gap-2 px-2'>

                <img
                    src={ Logo }
                    className='size-4' />

                <Text
                    variant='captionStrong'
                    text={ T('App.Name') } />

            </Horizontal>

            <Horizontal className='h-full'>

                {
                    controlMap.map((item) => (
                        <Button
                            key={ item.key }
                            aria-label={ item.label }
                            onClick={ item.action }
                            className='flex h-full w-10 cursor-pointer items-center justify-center text-txt-normal transition-colors duration-(--duration-base) hover:bg-btn-muted-hover active:bg-btn-muted-active'>

                            { item.icon }

                        </Button>
                    ))
                }

            </Horizontal>

        </div>
    );
}
