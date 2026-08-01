import { useState } from 'react';
import { IoChevronForward } from 'react-icons/io5';
import { FiGlobe, FiLogOut, FiMoon, FiSun } from 'react-icons/fi';
import { HiOutlineDocumentText, HiOutlineLockClosed } from 'react-icons/hi2';

import Button from '../ui/button';
import MenuRow from '../ui/menu';
import { Modal, ModalHeader } from '../ui/modal';

import { getTheme, setTheme } from '../../utility/theme';
import { getDirection, T } from '../../utility/language';

/**
 * DashboardSettings - App settings: language, theme, lock, and logout.
 *
 * Reached from the gear button on the wallet tab rather than the navigation bar, so the bar stays reserved for the three primary surfaces.
 *
 * Account labels are not edited here — they belong to the account switcher, next to the account they rename. Network selection likewise lives on the wallet tab, next to the balance it changes.
 * @param {object} props Component props.
 * @param {() => void} props.onLanguage Opens the language modal.
 * @param {() => void} props.onPhrase Opens the recovery phrase modal.
 * @param {() => void} props.onLock Locks the wallet and returns to the unlock screen.
 * @param {() => void} props.onLogout Opens the logout confirmation modal.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The settings modal.
 */
export default function DashboardSettings({ onLanguage, onPhrase, onLock, onLogout, onClose }: { onLanguage: () => void; onPhrase: () => void; onLock: () => void; onLogout: () => void; onClose: () => void })
{
    const [ theme, setThemeState ] = useState(getTheme());

    const onToggleTheme = () =>
    {
        const next = getTheme() === 'light' ? 'dark' : 'light';

        setThemeState(next);

        void setTheme(next);
    };

    return (
        <Modal
            onClose={ onClose }
            panelClass='max-h-[80vh] overflow-y-auto'>

            <ModalHeader
                title={ T('Dashboard.Settings.Title') }
                onClose={ onClose } />

            <MenuRow
                icon={ <FiGlobe size={ 16 } /> }
                label={ T('Intro.Language') }
                onClick={ onLanguage }
                trailing={ <IoChevronForward size={ 18 } className={ getDirection() === 'rtl' ? 'rotate-180 text-txt-muted' : 'text-txt-muted' } /> } />

            <MenuRow
                icon={ theme === 'light' ? <FiMoon size={ 16 } /> : <FiSun size={ 16 } /> }
                label={ T('Dashboard.Settings.Theme') }
                onClick={ onToggleTheme }
                trailing={
                    (
                        <div className='text-tiny text-txt-muted'>

                            { theme === 'light' ? T('Dashboard.Settings.ThemeLight') : T('Dashboard.Settings.ThemeDark') }

                        </div>
                    )
                } />

            <MenuRow
                icon={ <HiOutlineDocumentText size={ 16 } /> }
                label={ T('Dashboard.Phrase.Title') }
                onClick={ onPhrase }
                trailing={ <IoChevronForward size={ 18 } className={ getDirection() === 'rtl' ? 'rotate-180 text-txt-muted' : 'text-txt-muted' } /> } />

            { /* Both are session-ending actions, so they share one row rather than a line each. */ }
            <div className='mt-1 flex gap-2'>

                <Button
                    variant='primary'
                    onClick={ onLock }
                    className='h-12 min-w-0 flex-1 rounded-xl text-small'>

                    <HiOutlineLockClosed size={ 16 } className='shrink-0' />

                    <span className='truncate'>

                        { T('Dashboard.Lock') }

                    </span>

                </Button>

                <Button
                    variant='destructive'
                    onClick={ onLogout }
                    className='h-12 min-w-0 flex-1 rounded-xl text-small'>

                    <FiLogOut size={ 16 } className={ `shrink-0 ${ getDirection() === 'rtl' ? 'rotate-180' : '' }` } />

                    <span className='truncate'>

                        { T('Dashboard.Settings.Logout') }

                    </span>

                </Button>

            </div>

        </Modal>
    );
}
