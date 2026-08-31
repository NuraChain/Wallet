import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { FiHelpCircle } from 'react-icons/fi';
import { motion } from 'motion/react';

import Text from '../components/ui/text';
import Alert from '../components/ui/alert';
import Button from '../components/ui/button';
import { PasswordField } from '../components/ui/field';

import PageContainer, { layer } from '../layout/container';
import Popover from '../components/ui/popover';
import { cn } from '../utility/cn';
import { T } from '../utility/language';
import { readVault } from '../core/vault';
import { closeBrowserLayers } from '../core/browser';
import { surfacePanel } from '../components/ui/panel';
import { passwordCheck } from '../core/password';
import { unlockSession } from '../core/session';
import { getValueEncrypted } from '../utility/storage';
import { Horizontal } from '../components/ui/stack';

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
                <Horizontal className='items-center justify-between gap-2'>
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
                            className='shrink-0'
                        >
                            <FiHelpCircle size={18} />
                        </Button>

                        <Popover
                            open={showHint}
                            anchor='inset-e-0 top-12'
                            onClose={() => {
                                setShowHint(false);
                            }}
                            className='w-56 p-3 text-start text-tiny text-txt-normal'
                        >
                            {T('Unlock.Recovery')}
                        </Popover>
                    </div>
                </Horizontal>

                <Alert size='comfortable' className='mt-2' text={error} />

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
                    size='submit'
                    loading={isLoading}
                    onClick={() => {
                        void onUnlock();
                    }}
                    className='mx-auto sm:w-fit sm:min-w-40 sm:px-8'
                    text={T('Unlock.Submit')}
                />
            </motion.div>
        </PageContainer>
    );
}
