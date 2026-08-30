import type { IconType } from 'react-icons';
import type { VaultKind } from '../../core/vault';

import { useState } from 'react';
import { FiEye, FiFileText, FiImage } from 'react-icons/fi';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import { PasswordField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { passwordCheck } from '../../core/password';
import { getExporter, phraseToPng } from '../../core/export';
import { getValueEncrypted } from '../../utility/storage';
import { Horizontal, Vertical } from '../ui/stack';

const exportMap: { kind: 'image' | 'text'; icon: IconType; label: string }[] = [
    { kind: 'image', icon: FiImage, label: 'Dashboard.Phrase.SaveImage' },
    { kind: 'text', icon: FiFileText, label: 'Dashboard.Phrase.SaveText' }
];

export default function DashboardPhrase({ kind, onClose }: { kind: VaultKind; onClose: () => void }) {
    const [error, setError] = useState('');
    const [secret, setSecret] = useState('');
    const [password, setPassword] = useState('');
    const [revealed, setRevealed] = useState(false);
    const [notice, setNotice] = useState({ ok: true, text: '' });
    const [isLoading, setIsLoading] = useState(false);

    const isKey = kind === 'privateKey';

    const words = secret.length === 0 ? [] : secret.trim().split(/\s+/);

    const exportList = isKey ? exportMap.filter((item) => item.kind === 'text') : exportMap;

    const unlockLabel = isKey ? T('Dashboard.Phrase.UnlockKey') : T('Dashboard.Phrase.Unlock');
    const missingError = isKey ? T('Dashboard.Phrase.ErrorMissingKey') : T('Dashboard.Phrase.ErrorMissing');

    const onExport = async (format: 'image' | 'text') => {
        const bridge = getExporter();

        if (secret.length === 0) {
            return;
        }

        const stamp = new Date().toISOString().slice(0, 10);
        const name = isKey ? `nura-private-key-${stamp}` : `nura-recovery-phrase-${stamp}`;

        const body = isKey ? secret : words.map((word, index) => `${index + 1}. ${word}`).join('\n');

        const failure =
            format === 'image'
                ? await bridge.saveImage(phraseToPng(words, T('Dashboard.Phrase.ExportImageTitle'), T('Dashboard.Phrase.ExportImageWarning')), `${name}.png`)
                : await bridge.saveText(body, `${name}.txt`);

        if (failure.length === 0) {
            setNotice({ ok: true, text: format === 'image' ? T('Dashboard.Phrase.ExportSavedImage') : T('Dashboard.Phrase.ExportSavedText') });

            return;
        }

        setNotice({ ok: false, text: failure === 'unsupported' ? T('Dashboard.Phrase.ExportUnsupported') : T('Dashboard.Phrase.ExportFailed') });
    };

    const onUnlock = async () => {
        setError('');

        if (password.trim().length === 0) {
            setError(T('Dashboard.Phrase.ErrorRequired'));

            return;
        }

        setIsLoading(true);

        try {
            if ((await passwordCheck(password)) !== 'ok') {
                setError(T('Dashboard.Phrase.ErrorInvalid'));

                return;
            }

            const stored = await getValueEncrypted('Wallet.Mnemonic', password);

            if (stored === undefined) {
                setError(missingError);

                return;
            }

            setSecret(stored.trim());
        } catch {
            setError(missingError);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader title={isKey ? T('Dashboard.Phrase.TitleKey') : T('Dashboard.Phrase.Title')} onClose={onClose} />

            <Alert variant='warning' text={isKey ? T('Dashboard.Phrase.WarningKey') : T('Dashboard.Phrase.Warning')} />

            <Alert text={error} />

            {secret.length === 0 ? (
                <>
                    <PasswordField
                        size='compact'
                        label={T('Dashboard.Phrase.Password')}
                        value={password}
                        onValue={setPassword}
                        onEnter={() => {
                            void onUnlock();
                        }}
                    />

                    <Button
                        dim
                        variant='primary'
                        size='action'
                        disabled={isLoading}
                        loading={isLoading}
                        onClick={() => {
                            void onUnlock();
                        }}
                        aria-label={isLoading ? T('Dashboard.Phrase.Pending') : undefined}
                        className='mt-1'
                        text={isLoading ? '' : unlockLabel}
                    />
                </>
            ) : (
                <div className='relative'>
                    {isKey ? (
                        <div
                            dir='ltr'
                            className={`rounded-control bg-base-1 px-3 py-2.5 transition-all duration-(--duration-fast) ${revealed ? '' : 'pointer-events-none blur-sm select-none'}`}
                        >
                            <Text variant='captionStrong' className='font-mono break-all' text={secret} />
                        </div>
                    ) : (
                        <div
                            dir='ltr'
                            className={`grid grid-cols-3 gap-1.5 transition-all duration-(--duration-fast) ${revealed ? '' : 'pointer-events-none blur-sm select-none'}`}
                        >
                            {words.map((word, index) => (
                                <Horizontal key={`${index}-${word}`} className='items-center gap-1 rounded-control bg-base-1 px-2 py-1.5'>
                                    <Text text={String(index + 1)} />

                                    <Text variant='captionStrong' className='truncate font-mono' text={word} />
                                </Horizontal>
                            ))}
                        </div>
                    )}

                    {!revealed && (
                        <Button
                            onClick={() => {
                                setRevealed(true);
                            }}
                            className='absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-surface bg-base-2/60 text-txt-normal hover:bg-base-2/70'
                        >
                            <FiEye size={20} />

                            <Text variant='captionStrong' text={T('Dashboard.Phrase.Reveal')} />
                        </Button>
                    )}

                    {revealed && (
                        <Vertical className='mt-3 gap-2'>
                            <Alert className='text-start' text={T('Dashboard.Phrase.ExportDanger')} />

                            <Horizontal className='gap-2'>
                                {exportList.map((item) => (
                                    <Button
                                        key={item.kind}
                                        variant='muted'
                                        onClick={() => {
                                            void onExport(item.kind);
                                        }}
                                        className='h-10 min-w-0 flex-1 rounded-surface text-tiny'
                                    >
                                        <item.icon size={14} className='shrink-0' />

                                        <Text className='truncate' text={T(item.label)} />
                                    </Button>
                                ))}
                            </Horizontal>

                            <Alert variant={notice.ok ? 'success' : 'error'} text={notice.text} />
                        </Vertical>
                    )}
                </div>
            )}
        </Modal>
    );
}
