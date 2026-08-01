import { useState } from 'react';
import { FaQuestion } from 'react-icons/fa';
import { motion, AnimatePresence } from 'motion/react';

import IntroPage from './intro';
import DashboardPage from './dashboard';

import Text from '../components/ui/text';
import Alert from '../components/ui/alert';
import Button from '../components/ui/button';
import { PasswordField } from '../components/ui/field';

import { T } from '../utility/language';
import { glassPanel } from '../components/ui/panel';
import { passwordCheck } from '../core/password';
import { openPage } from '../utility/context';
import { getValueEncrypted } from '../utility/storage';

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
            const outcome = await passwordCheck(password);

            // No stored hash means there is no wallet on this device, so there is nothing to unlock.
            if (outcome === 'missing')
            {
                openPage(IntroPage);

                return;
            }

            if (outcome === 'invalid')
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

            <div className={ `${ glassPanel } flex w-full max-w-md flex-col gap-4 rounded-3xl p-6` }>

                <div className='flex items-center justify-between gap-2'>

                    <div>

                        <Text
                            variant='heading'
                            text={ T('Unlock.Title') } />

                        <Text text={ T('Unlock.Subtitle') } />

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
                                        className={ `${ glassPanel } absolute inset-e-0 top-12 w-56 origin-top rounded-xl p-3 text-start text-tiny text-txt-normal` }>

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

                <Alert
                    variant='danger'
                    className='mt-2 rounded-xl text-center text-small'
                    text={ error } />

                <PasswordField
                    label={ T('Unlock.Password') }
                    value={ password }
                    lockSize={ 18 }
                    onValue={ setPassword }
                    onEnter={ () => { void onUnlock(); } } />

                { /*
                  * The spinner replaces the label rather than joining it. Unlocking takes a moment —
                  * Argon2id is meant to — and the spinner alone says "working" without a second word
                  * appearing where the first one was.
                  *
                  * `min-w` holds the resting width so the button does not shrink around the spinner
                  * and snap back, and it is wide enough for either language's label.
                  *
                  * The label the spinner replaced becomes the accessible name for as long as it is
                  * gone, so a screen reader still hears what the button is doing.
                  */ }
                <Button
                    variant='primary'
                    disabled={ isLoading }
                    loading={ isLoading }
                    onClick={ () => { void onUnlock(); } }
                    aria-label={ isLoading ? T('Unlock.Loading') : undefined }
                    className='mx-auto h-12 w-fit min-w-40 rounded-xl px-8 py-2 disabled:opacity-60'
                    text={ isLoading ? '' : T('Unlock.Submit') } />

            </div>

        </motion.div>
    );
}
