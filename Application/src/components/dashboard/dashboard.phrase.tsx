import { useState } from 'react';
import { FiEye, FiFileText, FiImage } from 'react-icons/fi';

import Alert from '../ui/alert';
import Button from '../ui/button';
import { PasswordField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

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
    const [ isLoading, setIsLoading ] = useState(false);

    // Off Android there is no MediaStore to write to, so the controls are simply absent.
    const exporter = getExporter();

    /**
     * onExport - Hands the phrase to the platform as a picture or a text file.
     *
     * Only reachable once the words are revealed, so exporting always follows an explicit password
     * check and an explicit tap.
     * @param {'image' | 'text'} kind Which file to write.
     */
    const onExport = async(kind: 'image' | 'text') =>
    {
        const bridge = getExporter();

        if (bridge === undefined || words.length === 0)
        {
            return;
        }

        const stamp = new Date().toISOString().slice(0, 10);

        const failure = kind === 'image' ?
            await bridge.saveImage(phraseToPng(words, T('Dashboard.Phrase.ExportImageTitle'), T('Dashboard.Phrase.ExportImageWarning')), `nura-recovery-phrase-${ stamp }.png`) :
            await bridge.saveText(words.map((word, index) => `${ index + 1 }. ${ word }`).join('\n'), `nura-recovery-phrase-${ stamp }.txt`);

        if (failure.length === 0)
        {
            setNotice(kind === 'image' ? T('Dashboard.Phrase.ExportSavedImage') : T('Dashboard.Phrase.ExportSavedText'));

            return;
        }

        setNotice(failure === 'unsupported' ? T('Dashboard.Phrase.ExportUnsupported') : T('Dashboard.Phrase.ExportFailed'));
    };

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
        <Modal
            onClose={ onClose }
            panelClass='max-h-[80vh] overflow-y-auto'>

            <ModalHeader
                title={ T('Dashboard.Phrase.Title') }
                onClose={ onClose } />

            <Alert variant='warning'>

                { T('Dashboard.Phrase.Warning') }

            </Alert>

            {
                error.length > 0 &&
                (
                    <Alert>

                        { error }

                    </Alert>
                )
            }

            {
                words.length === 0 ?
                    (
                        <>
                            <PasswordField
                                size='compact'
                                label={ T('Dashboard.Phrase.Password') }
                                value={ password }
                                onValue={ setPassword }
                                onEnter={ () => { void onUnlock(); } } />

                            <Button
                                variant='primary'
                                size='action'
                                disabled={ isLoading }
                                loading={ isLoading }
                                onClick={ () => { void onUnlock(); } }
                                className='mt-1 disabled:cursor-not-allowed! disabled:opacity-60'>

                                {
                                    isLoading ? T('Dashboard.Phrase.Pending') : T('Dashboard.Phrase.Unlock')
                                }

                            </Button>
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
                                            className='flex items-center gap-1 rounded-lg bg-base-1 px-2 py-1.5'>

                                            <span className='text-tiny text-txt-muted'>

                                                { index + 1 }

                                            </span>

                                            <span className='truncate font-mono text-tiny text-txt-normal'>

                                                { word }

                                            </span>

                                        </div>
                                    ))
                                }

                            </div>

                            {
                                !revealed &&
                                (
                                    <Button
                                        onClick={ () => { setRevealed(true); } }
                                        className='absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-base-2/60 text-txt-normal'>

                                        <FiEye size={ 20 } />

                                        <span className='text-tiny'>

                                            { T('Dashboard.Phrase.Reveal') }

                                        </span>

                                    </Button>
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
                                        <Alert variant='danger'>

                                            { T('Dashboard.Phrase.ExportDanger') }

                                        </Alert>

                                        <div className='flex gap-2'>

                                            <Button
                                                variant='muted'
                                                onClick={ () => { void onExport('image'); } }
                                                className='h-10 min-w-0 flex-1 rounded-xl text-tiny'>

                                                <FiImage size={ 14 } className='shrink-0' />

                                                <span className='truncate'>

                                                    { T('Dashboard.Phrase.SaveImage') }

                                                </span>

                                            </Button>

                                            <Button
                                                variant='muted'
                                                onClick={ () => { void onExport('text'); } }
                                                className='h-10 min-w-0 flex-1 rounded-xl text-tiny'>

                                                <FiFileText size={ 14 } className='shrink-0' />

                                                <span className='truncate'>

                                                    { T('Dashboard.Phrase.SaveText') }

                                                </span>

                                            </Button>

                                        </div>

                                        {
                                            notice.length > 0 &&
                                            (
                                                <div className='text-center text-tiny text-txt-muted'>

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

        </Modal>
    );
}
