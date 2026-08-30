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
import { Vertical } from '../ui/stack';

import { T } from '../../utility/language';
import { getTheme, setTheme } from '../../utility/theme';

const chevron = <IoChevronForward size={18} className='text-txt-muted rtl:rotate-180' />;

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
        <Modal frame='screen' scale={0.96} onClose={onClose} panelClass='size-full p-0'>
            <Vertical className='mx-auto size-full max-w-lg gap-3 overflow-y-auto p-5'>
                <ModalHeader title={T('Dashboard.Settings.Title')} close='chip' onClose={onClose} />

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

                <div className='flex-1' />

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

                <Text dir='ltr' className='pt-1 text-center' text={T('Dashboard.Settings.Version', __APP_VERSION__)} />
            </Vertical>
        </Modal>
    );
}
