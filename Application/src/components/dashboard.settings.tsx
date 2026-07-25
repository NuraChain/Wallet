import { useState } from 'react';
import { FiGlobe, FiLogOut, FiMoon, FiSun } from 'react-icons/fi';
import { HiOutlineLockClosed } from 'react-icons/hi2';
import { IoChevronForward } from 'react-icons/io5';

import { getTheme, setTheme } from '../utility/theme';
import { getDirection, T } from '../utility/language';

/**
 * DashboardSettings - Account and app settings: name, language, theme, lock, and logout.
 *
 * Network selection deliberately lives on the wallet tab only — it belongs next to the balance it changes.
 * @param {object} props Component props.
 * @param {string} props.name The current account label.
 * @param {(name: string) => void} props.onRename Persists a new account label.
 * @param {() => void} props.onLanguage Opens the language modal.
 * @param {() => void} props.onLock Locks the wallet and returns to the unlock screen.
 * @param {() => void} props.onLogout Opens the logout confirmation modal.
 * @returns {JSX.Element} The settings tab.
 */
export default function DashboardSettings({ name, onRename, onLanguage, onLock, onLogout }: { name: string; onRename: (name: string) => void; onLanguage: () => void; onLock: () => void; onLogout: () => void })
{
    const [ draft, setDraft ] = useState(name);
    const [ theme, setThemeState ] = useState(getTheme());

    const onToggleTheme = () =>
    {
        const next = getTheme() === 'light' ? 'dark' : 'light';

        setThemeState(next);

        void setTheme(next);
    };

    const onSaveName = () =>
    {
        const trimmed = draft.trim();

        if (trimmed.length > 0)
        {
            onRename(trimmed);
        }
    };

    return (
        <div className='flex flex-col gap-4'>

            <div className='flex flex-col gap-2'>

                <div className='text-tiny text-txt-muted'>

                    { T('Dashboard.Settings.WalletName') }

                </div>

                <div className='flex gap-2'>

                    <input
                        value={ draft }
                        placeholder={ T('Dashboard.Settings.WalletName') }
                        onChange={ (event) => { setDraft(event.target.value); } }
                        onBlur={ onSaveName }
                        className='glass-input h-11 flex-1 rounded-xl px-3 text-small' />

                    <button
                        type='button'
                        onClick={ onSaveName }
                        className='btn-primary h-11 rounded-xl px-4 text-small'>

                        { T('Dashboard.Settings.Save') }

                    </button>

                </div>

            </div>

            <button
                type='button'
                onClick={ onLanguage }
                className='glass-panel flex h-14 items-center gap-3 rounded-xl px-3'>

                <div className='flex size-8 items-center justify-center rounded-full bg-btn-muted text-txt-normal'>

                    <FiGlobe size={ 16 } />

                </div>

                <div className='flex-1 text-start text-small text-txt-normal'>

                    { T('Intro.Language') }

                </div>

                <IoChevronForward size={ 18 } className={ getDirection() === 'rtl' ? 'rotate-180 text-txt-muted' : 'text-txt-muted' } />

            </button>

            <button
                type='button'
                onClick={ onToggleTheme }
                className='glass-panel flex h-14 items-center gap-3 rounded-xl px-3'>

                <div className='flex size-8 items-center justify-center rounded-full bg-btn-muted text-txt-normal'>

                    {
                        theme === 'light' ? <FiMoon size={ 16 } /> : <FiSun size={ 16 } />
                    }

                </div>

                <div className='flex-1 text-start text-small text-txt-normal'>

                    { T('Dashboard.Settings.Theme') }

                </div>

                <div className='text-tiny text-txt-muted'>

                    { theme === 'light' ? T('Dashboard.Settings.ThemeLight') : T('Dashboard.Settings.ThemeDark') }

                </div>

            </button>

            <button
                type='button'
                onClick={ onLock }
                className='btn-primary mt-2 flex h-12 items-center justify-center gap-2 rounded-xl text-small'>

                <HiOutlineLockClosed size={ 16 } />

                { T('Dashboard.Lock') }

            </button>

            <button
                type='button'
                onClick={ onLogout }
                className='btn-muted flex h-12 items-center justify-center gap-2 rounded-xl text-small text-txt-error'>

                <FiLogOut size={ 16 } className={ getDirection() === 'rtl' ? 'rotate-180' : '' } />

                { T('Dashboard.Settings.Logout') }

            </button>

        </div>
    );
}
