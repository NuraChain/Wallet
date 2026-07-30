import { useState } from 'react';
import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';
import { FiAlertTriangle, FiEye, FiFileText, FiImage } from 'react-icons/fi';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { HiEye, HiEyeOff, HiOutlineLockClosed } from 'react-icons/hi';

import { T } from '../../utility/language';
import { getExporter, phraseToPng } from '../../core/export';
import { passwordVerify } from '../../core/password';
import { getValue, getValueEncrypted } from '../../utility/storage';

/**
 * DashboardPhrase - Password-gated reveal of the recovery phrase.
 *
 * Anyone holding these words owns the wallet outright, so the flow puts two deliberate steps in the
 * way. First the password is verified against the stored Argon2 hash and used to decrypt the mnemonic
 * — the words are read back out of storage rather than passed down from the dashboard, so the secret
 * does not travel through the component tree just to be shown here.
 *
 * Then the words render blurred behind a tap-to-reveal cover, which is what stops them appearing to
 * whoever happens to be looking at the screen at that moment.
 *
 * The phrase is deliberately not copyable: the clipboard is readable by other apps.
 * @param {object} props Component props.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The recovery phrase modal.
 */
export default function DashboardPhrase({ onClose }: { onClose: () => void })
{
    const [ error, setError ] = useState('');
    const [ words, setWords ] = useState<string[]>([]);
    const [ password, setPassword ] = useState('');
    const [ revealed, setRevealed ] = useState(false);
    const [ notice, setNotice ] = useState('');

    // Off Android there is no MediaStore to write to, so the controls are simply absent.
    const exporter = getExporter();

    /**
     * onExport - Hands the phrase to the platform as a picture or a text file.
     *
     * Only reachable once the words are revealed, so exporting always follows an explicit password
     * check and an explicit tap.
     * @param {'image' | 'text'} kind Which file to write.
     */
    const onExport = (kind: 'image' | 'text') =>
    {
        const bridge = getExporter();

        if (bridge === undefined || words.length === 0)
        {
            return;
        }

        const stamp = new Date().toISOString().slice(0, 10);

        const failure = kind === 'image' ?
            bridge.saveImage(phraseToPng(words, T('Dashboard.Phrase.ExportImageTitle'), T('Dashboard.Phrase.ExportImageWarning')), `nura-recovery-phrase-${ stamp }.png`) :
            bridge.saveText(words.map((word, index) => `${ index + 1 }. ${ word }`).join('\n'), `nura-recovery-phrase-${ stamp }.txt`);

        if (failure.length === 0)
        {
            setNotice(kind === 'image' ? T('Dashboard.Phrase.ExportSavedImage') : T('Dashboard.Phrase.ExportSavedText'));

            return;
        }

        setNotice(failure === 'unsupported' ? T('Dashboard.Phrase.ExportUnsupported') : T('Dashboard.Phrase.ExportFailed'));
    };
    const [ isLoading, setIsLoading ] = useState(false);
    const [ showPassword, setShowPassword ] = useState(false);

    const onUnlock = async() =>
    {
        setError('');

        if (password.trim().length === 0)
        {
            setError(T('Dashboard.Phrase.ErrorRequired'));

            return;
        }

        setIsLoading(true);

        try
        {
            const storedHash = await getValue('Wallet.Password');

            if (storedHash === undefined || !await passwordVerify(password, storedHash))
            {
                setError(T('Dashboard.Phrase.ErrorInvalid'));

                return;
            }

            const mnemonic = await getValueEncrypted('Wallet.Mnemonic', password);

            if (mnemonic === undefined)
            {
                setError(T('Dashboard.Phrase.ErrorMissing'));

                return;
            }

            setWords(mnemonic.trim().split(/\s+/));
        }
        catch
        {
            setError(T('Dashboard.Phrase.ErrorMissing'));
        }
        finally
        {
            setIsLoading(false);
        }
    };

    return (
        <>
            <motion.div
                initial={ { opacity: 0 } }
                animate={ { opacity: 1 } }
                exit={ { opacity: 0 } }
                className='absolute z-30 size-full cursor-pointer bg-black/25 backdrop-blur-xs'
                onClick={ onClose } />

            <div className='absolute inset-0 z-30 m-auto flex size-fit items-center justify-center'>

                <motion.div
                    initial={ { opacity: 0, scale: 0.9 } }
                    animate={ { opacity: 1, scale: 1 } }
                    exit={ { opacity: 0, scale: 0.9 } }
                    className='glass-panel flex max-h-[80vh] w-80 flex-col gap-3 overflow-y-auto rounded-2xl p-4'>

                    <div className='flex items-center justify-between'>

                        <div className='text-medium text-txt-normal font-bold'>

                            { T('Dashboard.Phrase.Title') }

                        </div>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted flex size-8 items-center justify-center rounded-lg'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

                    <div className='bg-txt-error/10 text-tiny text-txt-error flex items-start gap-2 rounded-xl px-3 py-2 text-start'>

                        <FiAlertTriangle size={ 16 } className='mt-0.5 shrink-0' />

                        <span>

                            { T('Dashboard.Phrase.Warning') }

                        </span>

                    </div>

                    {
                        error.length > 0 &&
                        (
                            <div className='bg-txt-error/15 text-tiny text-txt-error rounded-lg px-3 py-2 text-center'>

                                { error }

                            </div>
                        )
                    }

                    {
                        words.length === 0 ?
                            (
                                <>
                                    <label className='flex flex-col gap-2'>

                                        <div className='text-tiny text-txt-muted'>

                                            { T('Dashboard.Phrase.Password') }

                                        </div>

                                        <div className='relative flex items-center'>

                                            <HiOutlineLockClosed className='text-txt-muted absolute left-3' size={ 18 } />

                                            <input
                                                value={ password }
                                                placeholder={ T('Dashboard.Phrase.Password') }
                                                type={ showPassword ? 'text' : 'password' }
                                                onChange={ (event) => { setPassword(event.target.value); } }
                                                // eslint-disable-next-line @typescript-eslint/strict-void-return
                                                onKeyDown={ (event) => event.key === 'Enter' && void onUnlock() }
                                                className='glass-input text-small h-11 w-full rounded-xl px-10' />

                                            <button
                                                type='button'
                                                onClick={ () => { setShowPassword((value) => !value); } }
                                                className='text-txt-muted absolute right-3 rounded-lg'>

                                                {
                                                    showPassword ? <HiEyeOff size={ 18 } /> : <HiEye size={ 18 } />
                                                }

                                            </button>

                                        </div>

                                    </label>

                                    <button
                                        type='button'
                                        disabled={ isLoading }
                                        onClick={ () => { void onUnlock(); } }
                                        className='btn-primary text-small mt-1 flex h-11 items-center justify-center gap-2 rounded-xl disabled:cursor-not-allowed! disabled:opacity-60'>

                                        {
                                            isLoading && <AiOutlineLoading3Quarters size={ 16 } className='shrink-0 animate-spin' />
                                        }

                                        {
                                            isLoading ? T('Dashboard.Phrase.Pending') : T('Dashboard.Phrase.Unlock')
                                        }

                                    </button>
                                </>
                            ) :
                            (
                                <div className='relative'>

                                    <div
                                        dir='ltr'
                                        className={ `grid grid-cols-3 gap-1.5 transition-all duration-300 ${ revealed ? '' : 'pointer-events-none blur-sm select-none' }` }>

                                        {
                                            words.map((word, index) => (
                                                <div
                                                    key={ `${ index }-${ word }` }
                                                    className='bg-base-1 flex items-center gap-1 rounded-lg px-2 py-1.5'>

                                                    <span className='text-tiny text-txt-muted'>

                                                        { index + 1 }

                                                    </span>

                                                    <span className='text-tiny text-txt-normal truncate font-mono'>

                                                        { word }

                                                    </span>

                                                </div>
                                            ))
                                        }

                                    </div>

                                    {
                                        !revealed &&
                                        (
                                            <button
                                                type='button'
                                                onClick={ () => { setRevealed(true); } }
                                                className='bg-base-2/60 text-txt-normal absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl'>

                                                <FiEye size={ 20 } />

                                                <span className='text-tiny'>

                                                    { T('Dashboard.Phrase.Reveal') }

                                                </span>

                                            </button>
                                        )
                                    }

                                    {
                                        revealed && exporter !== undefined &&
                                        (
                                            <div className='mt-3 flex flex-col gap-2'>

                                                { /*
                                                  * Spelled out every time rather than shown once: a file
                                                  * on shared storage outlives the moment it was written,
                                                  * and the gallery copy is the one people forget.
                                                  */ }
                                                <div className='bg-txt-error/10 text-tiny text-txt-error rounded-lg px-3 py-2'>

                                                    { T('Dashboard.Phrase.ExportDanger') }

                                                </div>

                                                <div className='flex gap-2'>

                                                    <button
                                                        type='button'
                                                        onClick={ () => { onExport('image'); } }
                                                        className='btn-muted flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl text-tiny'>

                                                        <FiImage size={ 14 } className='shrink-0' />

                                                        <span className='truncate'>

                                                            { T('Dashboard.Phrase.SaveImage') }

                                                        </span>

                                                    </button>

                                                    <button
                                                        type='button'
                                                        onClick={ () => { onExport('text'); } }
                                                        className='btn-muted flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl text-tiny'>

                                                        <FiFileText size={ 14 } className='shrink-0' />

                                                        <span className='truncate'>

                                                            { T('Dashboard.Phrase.SaveText') }

                                                        </span>

                                                    </button>

                                                </div>

                                                {
                                                    notice.length > 0 &&
                                                    (
                                                        <div className='text-tiny text-txt-muted text-center'>

                                                            { notice }

                                                        </div>
                                                    )
                                                }

                                            </div>
                                        )
                                    }

                                </div>
                            )
                    }

                </motion.div>

            </div>
        </>
    );
}
