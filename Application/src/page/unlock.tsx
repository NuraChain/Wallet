import { useState } from 'react';
import { FaQuestion } from 'react-icons/fa';
import { motion, AnimatePresence } from 'motion/react';

import IntroPage from './intro';
import DashboardPage from './dashboard';

import Alert from '../components/ui/alert';
import Button from '../components/ui/button';
import { PasswordField } from '../components/ui/field';

import { T } from '../utility/language';
import { passwordVerify } from '../core/password';
import { openPage } from '../utility/context';
import { getValue, getValueEncrypted, isConvertedEncrypted, setValueEncrypted } from '../utility/storage';

export default function UnlockPage()
{
    const [ error, setError ] = useState('');
    const [ password, setPassword ] = useState('');
    const [ showHint, setShowHint ] = useState(false);
    const [ isLoading, setIsLoading ] = useState(false);

    const onUnlock = async() =>
    {
        setError('');

        if (password.trim().length === 0)
        {
            setError(T('Unlock.ErrorRequired'));

            return;
        }

        setIsLoading(true);

        try
        {
            const storedHash = await getValue('Wallet.Password');

            if (storedHash === undefined)
            {
                openPage(IntroPage);

                return;
            }

            const isValid = await passwordVerify(password, storedHash);

            if (!isValid)
            {
                setError(T('Unlock.ErrorInvalid'));

                return;
            }

            const mnemonic = await getValueEncrypted('Wallet.Mnemonic', password);

            if (mnemonic === undefined)
            {
                setError(T('Unlock.ErrorMissing'));

                return;
            }

            // Converge a device that ran the Argon2id build back onto the current derivation, so the
            // compatibility path in storage stops being load-bearing after one successful unlock.
            if (await isConvertedEncrypted('Wallet.Mnemonic'))
            {
                await setValueEncrypted('Wallet.Mnemonic', mnemonic, password);
            }

            openPage(DashboardPage, { mnemonic });
        }
        catch
        {
            // Decryption throws on a bad key or a corrupted payload. Without this the rejection went
            // nowhere and the button simply re-enabled, which reads as the app ignoring the tap.
            setError(T('Unlock.ErrorMissing'));
        }
        finally
        {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            initial={ { opacity: 0 } }
            animate={ { opacity: 1 } }
            transition={ { type: 'tween' } }
            className='flex size-full items-center justify-center bg-base-1 px-4'>

            <div className='glass-panel flex w-full max-w-md flex-col gap-4 rounded-3xl p-6'>

                <div className='flex items-center justify-between gap-2'>

                    <div>

                        <div className='text-large font-semibold text-txt-normal'>

                            { T('Unlock.Title') }

                        </div>

                        <div className='text-tiny text-txt-muted'>

                            { T('Unlock.Subtitle') }

                        </div>

                    </div>

                    <div className='relative z-20'>

                        <Button
                            variant='muted'
                            size='iconLarge'
                            onClick={ () => { setShowHint((value) => !value); } }
                            className='shrink-0'>

                            <FaQuestion size={ 18 } />

                        </Button>

                        <AnimatePresence>

                            {
                                showHint &&
                                (
                                    <motion.div
                                        initial={ { opacity: 0, scale: 0.95, y: -4 } }
                                        animate={ { opacity: 1, scale: 1, y: 0 } }
                                        exit={ { opacity: 0, scale: 0.95, y: -4 } }
                                        transition={ { duration: 0.15 } }
                                        className='glass-panel absolute inset-e-0 top-12 w-56 origin-top rounded-xl p-3 text-start text-tiny text-txt-normal'>

                                        { T('Unlock.Recovery') }

                                    </motion.div>
                                )
                            }

                        </AnimatePresence>

                    </div>

                </div>

                {
                    showHint &&
                    (
                        <div
                            className='fixed inset-0 z-10'
                            onClick={ () => { setShowHint(false); } } />
                    )
                }

                {
                    error.length > 0 &&
                    (
                        <Alert className='mt-2 rounded-xl bg-txt-error/10 text-small'>

                            { error }

                        </Alert>
                    )
                }

                <PasswordField
                    label={ T('Unlock.Password') }
                    value={ password }
                    lockSize={ 18 }
                    onValue={ setPassword }
                    onEnter={ () => { void onUnlock(); } } />

                { /*
                  * `ltr` pins the spinner ahead of the label. The row is a flex container, so it
                  * follows the page direction — under Persian that puts the first child, the spinner,
                  * at the right-hand end, behind the word it belongs to.
                  */ }
                <Button
                    variant='primary'
                    dir='ltr'
                    disabled={ isLoading }
                    loading={ isLoading }
                    onClick={ () => { void onUnlock(); } }
                    className='mx-auto h-12 w-fit rounded-xl px-8 py-2 disabled:cursor-not-allowed! disabled:opacity-60'
                    text={ isLoading ? T('Unlock.Loading') : T('Unlock.Submit') } />

            </div>

        </motion.div>
    );
}
