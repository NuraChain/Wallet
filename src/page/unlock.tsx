import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleQuestionMark } from 'lucide-react';
import { motion } from 'motion/react';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import { PasswordField } from '../ui/field';

import PageContainer, { layer } from '../layout/container';
import Popover from '../ui/popover';
import { cn } from '../utility/cn';
import { T } from '../utility/language';
import { readVault } from '../core/vault';
import { closeBrowserLayers } from '../core/browser';
import { surfacePanel } from '../ui/panel';
import { passwordCheck } from '../core/password';
import { unlockSession } from '../core/session';
import { getValueEncrypted } from '../utility/storage';
import { Horizontal } from '../ui/stack';

export default function UnlockPage() {
    useEffect(() => {
        closeBrowserLayers();
    }, []);

    const navigate = useNavigate();

    const [error, setError] = useState('');
    const [password, setPassword] = useState('');
    const [showHint, setShowHint] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const onUnlock = async () => {
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

    return (
        <PageContainer variant='intro' className='items-center justify-center'>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: 'tween' }}
                className={cn(surfacePanel, 'flex w-full max-w-md flex-col gap-4 rounded-dialog p-6')}
            >
                <Horizontal align='center' justify='between' gap={2}>
                    <div>
                        <Text as='h1' variant='heading' text={T('Unlock.Title')} />

                        <Text text={T('Unlock.Subtitle')} />
                    </div>

                    <div className={`relative ${layer.popover}`}>
                        <Button
                            variant='muted'
                            size='iconLarge'
                            onClick={() => {
                                setShowHint((value) => !value);
                            }}
                            shrink={false}
                        >
                            <CircleQuestionMark size={18} />
                        </Button>

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
                    </div>
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
            </motion.div>
        </PageContainer>
    );
}
