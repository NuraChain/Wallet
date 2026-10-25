import { useState } from 'react';
import { ArrowLeft, ChevronRight, Fingerprint, Globe, Moon, MousePointerClick, ScanFace, Sun, FileText, Lock, Trash2 } from 'lucide-react';

import Text from '../../ui/text';
import Button from '../../ui/button';
import IconBox from '../../ui/iconbox';
import MenuRow from '../../ui/menu';
import { ModalActions } from '../../ui/modal';
import { Horizontal, Vertical } from '../../ui/stack';

import { T } from '../../utility/language';
import { getTheme, setTheme } from '../../utility/theme';
import type { VaultKind } from '../../type/wallet';
import type { BiometricKind } from '../../type/platform';
import { Block } from '../../ui/wrap';

const chevron = <ChevronRight size={18} className='text-txt-muted rtl:rotate-180' />;

export default function DashboardSettings({
    kind,
    onBack,
    onLanguage,
    onMouse,
    biometric,
    onBiometric,
    onPhrase,
    onLock,
    onDelete
}: {
    kind: VaultKind;
    onBack: () => void;
    onLanguage: () => void;
    onMouse?: () => void;
    /** Undefined where the device has no biometrics to offer. */
    biometric?: { kind: BiometricKind; on: boolean };
    onBiometric: () => void;
    onPhrase: () => void;
    onLock: () => void;
    onDelete: () => void;
}) {
    const [theme, setThemeState] = useState(getTheme());

    const onToggleTheme = () => {
        const next = getTheme() === 'light' ? 'dark' : 'light';

        setThemeState(next);

        void setTheme(next);
    };

    return (
        <Vertical mt={2} squeeze='y' grow gap={3}>
            <Horizontal align='center' gap={3}>
                <Button variant='chip' size='iconChip' onClick={onBack} shrink={false} icon={<ArrowLeft size={17} className='rtl:rotate-180' />} />

                <Text as='h1' variant='heading' py={2} text={T('Dashboard.Settings.Title')} />
            </Horizontal>

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

            {onMouse !== undefined && (
                <MenuRow
                    leading={
                        <IconBox>
                            <MousePointerClick size={16} />
                        </IconBox>
                    }
                    label={T('Dashboard.Mouse.Title')}
                    onClick={onMouse}
                    trailing={chevron}
                />
            )}

            {biometric !== undefined && (
                <MenuRow
                    leading={<IconBox>{biometric.kind === 'face' ? <ScanFace size={16} /> : <Fingerprint size={16} />}</IconBox>}
                    label={T('Dashboard.Biometric.Row')}
                    onClick={onBiometric}
                    trailing={<Text text={T(biometric.on ? 'Dashboard.Biometric.On' : 'Dashboard.Biometric.Off')} />}
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

            <Block grow />

            <ModalActions>
                <Button
                    variant='primary'
                    size='action'
                    onClick={onLock}
                    leftIcon={<Lock size={16} className='shrink-0' />}
                    squeeze='x'
                    label={T('Dashboard.Lock')}
                />

                <Button
                    variant='destructive'
                    size='action'
                    onClick={onDelete}
                    leftIcon={<Trash2 size={16} className='shrink-0' />}
                    squeeze='x'
                    label={T('Dashboard.Settings.Delete')}
                />
            </ModalActions>

            <Text dir='ltr' pt={1} align='center' text={T('Dashboard.Settings.Version', __APP_VERSION__)} />
        </Vertical>
    );
}
