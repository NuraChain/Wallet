import type { VaultKind } from '../../core/vault';

import { useState } from 'react';
import { ChevronRight, Globe, LogOut, Moon, PanelLeft, Sun, FileText, Lock } from 'lucide-react';

import Text from '../ui/text';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import MenuRow from '../ui/menu';
import { ModalActions } from '../ui/modal';
import { Vertical } from '../ui/stack';

import { platform } from '../../platform';
import { T } from '../../utility/language';
import { useHasPanel } from '../../hook/platform';
import { getTheme, setTheme } from '../../utility/theme';

const chevron = <ChevronRight size={18} className='text-txt-muted rtl:rotate-180' />;

export default function DashboardSettings({
    kind,
    onLanguage,
    onPhrase,
    onLock,
    onLogout
}: {
    kind: VaultKind;
    onLanguage: () => void;
    onPhrase: () => void;
    onLock: () => void;
    onLogout: () => void;
}) {
    const [theme, setThemeState] = useState(getTheme());

    const hasPanel = useHasPanel();

    const onToggleTheme = () => {
        const next = getTheme() === 'light' ? 'dark' : 'light';

        setThemeState(next);

        void setTheme(next);
    };

    return (
        <Vertical className='mt-2 min-h-0 flex-1 gap-3'>
            <Text as='h1' variant='heading' className='py-2' text={T('Dashboard.Settings.Title')} />

            <MenuRow
                leading={
                    <IconBox>
                        <Globe size={16} />
                    </IconBox>
                }
                label={T('Intro.Language')}
                onClick={onLanguage}
                trailing={chevron}
            />

            <MenuRow
                leading={<IconBox>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</IconBox>}
                label={T('Dashboard.Settings.Theme')}
                onClick={onToggleTheme}
                trailing={<Text text={theme === 'light' ? T('Dashboard.Settings.ThemeLight') : T('Dashboard.Settings.ThemeDark')} />}
            />

            {/* The panel opens and the popup this row lives in closes, so nothing here has to be
                told about it afterwards. */}
            {hasPanel && (
                <MenuRow
                    leading={
                        <IconBox>
                            <PanelLeft size={16} className='rtl:rotate-180' />
                        </IconBox>
                    }
                    label={T('Dashboard.Settings.SidePanel')}
                    onClick={platform.panel.open}
                    trailing={chevron}
                />
            )}

            <MenuRow
                leading={
                    <IconBox>
                        <FileText size={16} />
                    </IconBox>
                }
                label={kind === 'privateKey' ? T('Dashboard.Phrase.TitleKey') : T('Dashboard.Phrase.Title')}
                onClick={onPhrase}
                trailing={chevron}
            />

            <div className='flex-1' />

            {/* One row, one metric, by request. Logout erases the wallet from this device and sits
                a target width from the everyday action, so the weight it carries is the fill:
                `destructive` is the only red button on the screen, and the password prompt behind
                it is what actually stands between a mis-tap and a lost wallet. */}
            <ModalActions>
                <Button variant='primary' size='action' onClick={onLock} leftIcon={<Lock size={16} className='shrink-0' />} className='min-w-0'>
                    <span className='truncate'>{T('Dashboard.Lock')}</span>
                </Button>

                <Button
                    variant='destructive'
                    size='action'
                    onClick={onLogout}
                    leftIcon={<LogOut size={16} className='shrink-0 rtl:rotate-180' />}
                    className='min-w-0'
                >
                    <span className='truncate'>{T('Dashboard.Settings.Logout')}</span>
                </Button>
            </ModalActions>

            <Text dir='ltr' className='pt-1 text-center' text={T('Dashboard.Settings.Version', __APP_VERSION__)} />
        </Vertical>
    );
}
