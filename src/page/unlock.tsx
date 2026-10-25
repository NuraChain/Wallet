import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleQuestionMark, Fingerprint, ScanFace } from 'lucide-react';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import { PasswordField } from '../ui/field';

import PageContainer from '../ui/container';
import Popover, { PopoverAnchor } from '../ui/popover';
import { T } from '../utility/language';
import { readVault } from '../core/vault';
import { closeBrowserLayers } from '../core/browser';
import { passwordCheck } from '../core/password';
import { unlockSession } from '../core/session';
import { biometricEnabled, biometricKind, unlockWithBiometric } from '../core/biometric';
import { getValueEncrypted } from '../utility/storage';
import { Horizontal } from '../ui/stack';
import { EntryCard } from '../ui/screen';
import { Block } from '../ui/wrap';
import type { BiometricKind } from '../type/platform';

export default function UnlockPage() {
    useEffect(() => {
        closeBrowserLayers();
    }, []);

    const navigate = useNavigate();

    const [error, setError] = useState('');
    const [password, setPassword] = useState('');
    const [showHint, setShowHint] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [biometric, setBiometric] = useState<BiometricKind | undefined>(undefined);

    const asked = useRef(false);

    const onUnlock = async () => {
        // Enter in the field can ask again while the first answer is still being worked out.
        if (isLoading) {
            return;
        }

        setError('');

        if (password.trim().length === 0) {
            setError(T('Unlock.ErrorRequired'));

            return;
        }

        setIsLoading(true);

        try {
            const outcome = await passwordCheck(password);

            if (outcome === 'missing') {
                await navigate('/intro', { replace: true });

                return;
            }

            if (outcome === 'invalid') {
                setError(T('Unlock.ErrorInvalid'));

                return;
            }

            const secret = await getValueEncrypted('Wallet.Mnemonic', password);

            if (secret === undefined) {
                setError(T('Unlock.ErrorMissing'));

                return;
            }

            unlockSession(readVault(secret));

            await navigate('/dashboard', { replace: true });
        } catch {
            setError(T('Unlock.ErrorMissing'));
        } finally {
            setIsLoading(false);
        }
    };

    // A cancel is quiet and leaves the button; a copy the device dropped takes the button away and says why.
    const onBiometric = async () => {
        if (isLoading) {
            return;
        }

        setError('');
        setIsLoading(true);

        try {
            const outcome = await unlockWithBiometric(T('Dashboard.Biometric.Prompt'));

            if (outcome === 'ok') {
                await navigate('/dashboard', { replace: true });

                return;
            }

            if (outcome === 'gone' || outcome === 'unavailable' || outcome === 'off') {
                setBiometric(undefined);
            }

            if (outcome === 'gone' || outcome === 'unavailable') {
                setError(T('Unlock.BiometricGone'));
            } else if (outcome === 'failed') {
                setError(T('Unlock.BiometricFailed'));
            }
        } finally {
            setIsLoading(false);
        }
    };

    const askBiometric = useEffectEvent(onBiometric);

    // Asked for once on arriving, never again by itself after a cancel.
    useEffect(() => {
        let live = true;

        void (async () => {
            const kind = await biometricKind();

            if (!live || kind === undefined || !(await biometricEnabled()) || !live) {
                return;
            }

            setBiometric(kind);

            if (!asked.current) {
                asked.current = true;

                void askBiometric();
            }
        })();

        return () => {
            live = false;
        };
    }, []);

    return (
        <PageContainer variant='intro' center>
            <EntryCard>
                <Horizontal align='center' justify='between' gap={2}>
                    <Block>
                        <Text as='h1' variant='heading' text={T('Unlock.Title')} />

                        <Text text={T('Unlock.Subtitle')} />
                    </Block>

                    <PopoverAnchor>
                        <Button
                            variant='muted'
                            size='iconLarge'
                            onClick={() => {
                                setShowHint((value) => !value);
                            }}
                            shrink={false}
                            icon={<CircleQuestionMark size={18} />}
                        />

                        <Popover
                            open={showHint}
                            anchor='corner'
                            onClose={() => {
                                setShowHint(false);
                            }}
                            look='note'
                        >
                            {T('Unlock.Recovery')}
                        </Popover>
                    </PopoverAnchor>
                </Horizontal>

                <Alert size='comfortable' mt={2} text={error} />

                <PasswordField
                    label={T('Unlock.Password')}
                    value={password}
                    lockSize={18}
                    onValue={setPassword}
                    onEnter={() => {
                        void onUnlock();
                    }}
                />

                <Button
                    dim
                    variant='primary'
                    size='ctaWide'
                    loading={isLoading}
                    onClick={() => {
                        void onUnlock();
                    }}
                    text={T('Unlock.Submit')}
                />

                {biometric !== undefined && (
                    <Button
                        variant='muted'
                        size='ctaWide'
                        disabled={isLoading}
                        onClick={() => {
                            void onBiometric();
                        }}
                        leftIcon={biometric === 'face' ? <ScanFace size={16} /> : <Fingerprint size={16} />}
                        text={T('Unlock.Biometric')}
                    />
                )}
            </EntryCard>
        </PageContainer>
    );
}
