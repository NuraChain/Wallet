import type { VaultKind } from '../../core/vault';

import { useState } from 'react';
import { IoChevronForward } from 'react-icons/io5';
import { FiGlobe, FiLogOut, FiMoon, FiSun } from 'react-icons/fi';
import { HiOutlineDocumentText, HiOutlineLockClosed } from 'react-icons/hi2';

import Text from '../ui/text';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import MenuRow from '../ui/menu';
import { Modal, ModalActions, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { getTheme, setTheme } from '../../utility/theme';

/**
 * The "go here" chevron, mirrored by the `rtl:` variant rather than by reading the active language at
 * render time — the document already carries `dir`, so the stylesheet can answer this on its own.
 */
const chevron = <IoChevronForward size={18} className='text-txt-muted rtl:rotate-180' />;

/**
 * DashboardSettings - App settings: language, theme, lock, and logout.
 *
 * Reached from the gear button on the wallet tab rather than the navigation bar, so the bar stays reserved for the three primary surfaces.
 *
 * Account labels are not edited here — they belong to the account switcher, next to the account they rename. Network selection likewise lives on the wallet tab, next to the balance it changes.
 * @param {object} props Component props.
 * @param {VaultKind} props.kind Which sort of secret this wallet holds, so the reveal row names it correctly.
 * @param {() => void} props.onLanguage Opens the language modal.
 * @param {() => void} props.onPhrase Opens the recovery phrase modal.
 * @param {() => void} props.onLock Locks the wallet and returns to the unlock screen.
 * @param {() => void} props.onLogout Opens the logout confirmation modal.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The settings modal.
 */
export default function DashboardSettings({
    kind,
    onLanguage,
    onPhrase,
    onLock,
    onLogout,
    onClose
}: {
    kind: VaultKind;
    onLanguage: () => void;
    onPhrase: () => void;
    onLock: () => void;
    onLogout: () => void;
    onClose: () => void;
}) {
    const [theme, setThemeState] = useState(getTheme());

    const onToggleTheme = () => {
        const next = getTheme() === 'light' ? 'dark' : 'light';

        setThemeState(next);

        void setTheme(next);
    };

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader title={T('Dashboard.Settings.Title')} onClose={onClose} />

            <MenuRow
                leading={
                    <IconBox>
                        <FiGlobe size={16} />
                    </IconBox>
                }
                label={T('Intro.Language')}
                onClick={onLanguage}
                trailing={chevron}
            />

            <MenuRow
                leading={<IconBox>{theme === 'light' ? <FiMoon size={16} /> : <FiSun size={16} />}</IconBox>}
                label={T('Dashboard.Settings.Theme')}
                onClick={onToggleTheme}
                trailing={<Text text={theme === 'light' ? T('Dashboard.Settings.ThemeLight') : T('Dashboard.Settings.ThemeDark')} />}
            />

            <MenuRow
                leading={
                    <IconBox>
                        <HiOutlineDocumentText size={16} />
                    </IconBox>
                }
                label={kind === 'privateKey' ? T('Dashboard.Phrase.TitleKey') : T('Dashboard.Phrase.Title')}
                onClick={onPhrase}
                trailing={chevron}
            />

            {/* Both are session-ending actions, so they share one row rather than a line each. */}
            <ModalActions>
                <Button variant='primary' size='action' onClick={onLock} className='min-w-0'>
                    <HiOutlineLockClosed size={16} className='shrink-0' />

                    <span className='truncate'>{T('Dashboard.Lock')}</span>
                </Button>

                <Button variant='destructive' size='action' onClick={onLogout} className='min-w-0'>
                    <FiLogOut size={16} className='shrink-0 rtl:rotate-180' />

                    <span className='truncate'>{T('Dashboard.Settings.Logout')}</span>
                </Button>
            </ModalActions>

            {/*
             * The last line on the panel, under the actions: it is the sort of thing looked for only
             * when reporting a problem, so it sits below everything that is here to be used rather
             * than between the settings and the buttons that end the session. The number is the one
             * baked in from `Cargo.toml`.
             */}
            <Text dir='ltr' className='pt-1 text-center' text={T('Dashboard.Settings.Version', __APP_VERSION__)} />
        </Modal>
    );
}
