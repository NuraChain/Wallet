import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FaQuestion } from 'react-icons/fa';
import { motion, AnimatePresence } from 'motion/react';

import Text from '../components/ui/text';
import Alert from '../components/ui/alert';
import Button from '../components/ui/button';
import { PasswordField } from '../components/ui/field';

import { layer } from '../layout/container';
import { T } from '../utility/language';
import { readVault } from '../core/vault';
import { surfacePanel } from '../components/ui/panel';
import { passwordCheck } from '../core/password';
import { unlockSession } from '../core/session';
import { getValueEncrypted } from '../utility/storage';
import { Horizontal, Vertical } from '../components/ui/stack';

export default function UnlockPage()
{
    const navigate = useNavigate();

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
                await navigate('/intro', { replace: true });

                return;
            }

            if (outcome === 'invalid')
            {
                setError(T('Unlock.ErrorInvalid'));

                return;
            }

            const secret = await getValueEncrypted('Wallet.Mnemonic', password);

            if (secret === undefined)
            {
                setError(T('Unlock.ErrorMissing'));

                return;
            }

            // The key is stored under the same name whichever sort it is, so what it turns out to be
            // is read off the material itself rather than from a marker beside it.
            //
            // The vault goes into the session rather than into the navigation: route state is written
            // to `history.state`, and a decrypted mnemonic does not belong there. `replace` so the
            // unlock screen is not left behind as somewhere "back" could return to.
            unlockSession(readVault(secret));

            await navigate('/dashboard', { replace: true });
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

            <Vertical className={ `${ surfacePanel } w-full max-w-md gap-4 rounded-dialog p-6` }>

                <Horizontal className='items-center justify-between gap-2'>

                    <div>

                        <Text
                            variant='heading'
                            text={ T('Unlock.Title') } />

                        <Text text={ T('Unlock.Subtitle') } />

                    </div>

                    <div className={ `relative ${ layer.popover }` }>

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
                                        className={ `${ surfacePanel } absolute inset-e-0 top-12 w-56 origin-top rounded-surface p-3 text-start text-tiny text-txt-normal` }>

                                        { T('Unlock.Recovery') }

                                    </motion.div>
                                )
                            }

                        </AnimatePresence>

                    </div>

                </Horizontal>

                {
                    showHint &&
                    (
                        <div
                            className={ `fixed inset-0 ${ layer.chrome }` }
                            onClick={ () => { setShowHint(false); } } />
                    )
                }

                <Alert
                    size='comfortable'
                    className='mt-2'
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
                    dim
                    variant='primary'
                    size='submit'
                    loading={ isLoading }
                    onClick={ () => { void onUnlock(); } }
                    className='mx-auto sm:w-fit sm:min-w-40 sm:px-8'
                    text={ T('Unlock.Submit') } />

            </Vertical>

        </motion.div>
    );
}
