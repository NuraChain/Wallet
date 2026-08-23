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

/**
 * The two files the phrase can be written as. Same button, same dimensions; only the glyph, the label
 * and which writer runs differ.
 *
 * The picture is a three-column grid of numbered words, so it is offered for a phrase only — a private
 * key is one unbroken 66-character token and would run straight out of the first cell. The key gets the
 * text file, which holds it exactly as it is.
 */
const exportMap: { kind: 'image' | 'text'; icon: IconType; label: string }[] =
[
    { kind: 'image', icon: FiImage, label: 'Dashboard.Phrase.SaveImage' },
    { kind: 'text', icon: FiFileText, label: 'Dashboard.Phrase.SaveText' }
];

/**
 * DashboardPhrase - Password-gated reveal of the wallet's secret.
 *
 * Anyone holding it owns the wallet outright, so the flow puts two deliberate steps in the way. First
 * the password is verified against the stored Argon2 hash and used to decrypt the secret — it is read
 * back out of storage rather than passed down from the dashboard, so it does not travel through the
 * component tree just to be shown here.
 *
 * Then it renders blurred behind a tap-to-reveal cover, which is what stops it appearing to whoever
 * happens to be looking at the screen at that moment.
 *
 * What is behind the cover depends on how the wallet was imported: a mnemonic renders as the numbered
 * word grid, a private key as the one token it is. `kind` comes down from the dashboard rather than
 * being read off the secret because the title and the button are on screen before anything is
 * decrypted, and they have to name the right thing from the start.
 *
 * The secret is deliberately not copyable: the clipboard is readable by other apps.
 * @param {object} props Component props.
 * @param {VaultKind} props.kind Which sort of secret this wallet holds.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The reveal modal.
 */
export default function DashboardPhrase({ kind, onClose }: { kind: VaultKind; onClose: () => void })
{
    const [ error, setError ] = useState('');
    const [ secret, setSecret ] = useState('');
    const [ password, setPassword ] = useState('');
    const [ revealed, setRevealed ] = useState(false);
    // The outcome, not just its wording: an export that succeeded and one that failed have to be
    // told apart by the surface, and a bare message string cannot say which it is.
    const [ notice, setNotice ] = useState({ ok: true, text: '' });
    const [ isLoading, setIsLoading ] = useState(false);

    const isKey = kind === 'privateKey';

    const words = secret.length === 0 ? [] : secret.trim().split(/\s+/);

    const exportList = isKey ? exportMap.filter((item) => item.kind === 'text') : exportMap;

    // Named here rather than inline, since the button already switches its label for the spinner and
    // the two conditions read as one unintelligible nest when they meet in the attribute.
    const unlockLabel = isKey ? T('Dashboard.Phrase.UnlockKey') : T('Dashboard.Phrase.Unlock');
    const missingError = isKey ? T('Dashboard.Phrase.ErrorMissingKey') : T('Dashboard.Phrase.ErrorMissing');

    /**
     * onExport - Hands the secret to the platform as a picture or a text file.
     *
     * Only reachable once it is revealed, so exporting always follows an explicit password check and
     * an explicit tap.
     * @param {'image' | 'text'} format Which file to write.
     */
    const onExport = async(format: 'image' | 'text') =>
    {
        const bridge = getExporter();

        if (secret.length === 0)
        {
            return;
        }

        const stamp = new Date().toISOString().slice(0, 10);
        const name = isKey ? `nura-private-key-${ stamp }` : `nura-recovery-phrase-${ stamp }`;

        // The numbered list is what makes a written-down phrase checkable; a key is one value and any
        // numbering around it would be noise in the file the user has to paste back somewhere.
        const body = isKey ? secret : words.map((word, index) => `${ index + 1 }. ${ word }`).join('\n');

        const failure = format === 'image' ?
            await bridge.saveImage(phraseToPng(words, T('Dashboard.Phrase.ExportImageTitle'), T('Dashboard.Phrase.ExportImageWarning')), `${ name }.png`) :
            await bridge.saveText(body, `${ name }.txt`);

        if (failure.length === 0)
        {
            setNotice({ ok: true, text: format === 'image' ? T('Dashboard.Phrase.ExportSavedImage') : T('Dashboard.Phrase.ExportSavedText') });

            return;
        }

        setNotice({ ok: false, text: failure === 'unsupported' ? T('Dashboard.Phrase.ExportUnsupported') : T('Dashboard.Phrase.ExportFailed') });
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
            // A device with no stored hash has no secret to show either, so both outcomes read the
            // same way from here.
            if (await passwordCheck(password) !== 'ok')
            {
                setError(T('Dashboard.Phrase.ErrorInvalid'));

                return;
            }

            const stored = await getValueEncrypted('Wallet.Mnemonic', password);

            if (stored === undefined)
            {
                setError(missingError);

                return;
            }

            setSecret(stored.trim());
        }
        catch
        {
            setError(missingError);
        }
        finally
        {
            setIsLoading(false);
        }
    };

    return (
        <Modal
            scroll
            onClose={ onClose }>

            <ModalHeader
                title={ isKey ? T('Dashboard.Phrase.TitleKey') : T('Dashboard.Phrase.Title') }
                onClose={ onClose } />

            <Alert
                variant='warning'
                text={ isKey ? T('Dashboard.Phrase.WarningKey') : T('Dashboard.Phrase.Warning') } />

            <Alert text={ error } />

            {
                secret.length === 0 ?
                    (
                        <>
                            <PasswordField
                                size='compact'
                                label={ T('Dashboard.Phrase.Password') }
                                value={ password }
                                onValue={ setPassword }
                                onEnter={ () => { void onUnlock(); } } />

                            { /*
                              * The spinner replaces the label rather than joining it, matching the
                              * unlock screen. The button fills the dialog's width either way, so
                              * nothing moves when the label steps out.
                              *
                              * The label it replaced becomes the accessible name for as long as it
                              * is gone, so a screen reader still hears what the button is doing.
                              */ }
                            <Button
                                dim
                                variant='primary'
                                size='action'
                                disabled={ isLoading }
                                loading={ isLoading }
                                onClick={ () => { void onUnlock(); } }
                                aria-label={ isLoading ? T('Dashboard.Phrase.Pending') : undefined }
                                className='mt-1'
                                text={ isLoading ? '' : unlockLabel } />
                        </>
                    ) :
                    (
                        <div className='relative'>

                            {
                                isKey ?
                                    (
                                        <div
                                            dir='ltr'
                                            className={ `rounded-control bg-base-1 px-3 py-2.5 transition-all duration-(--duration-fast) ${ revealed ? '' : 'pointer-events-none blur-sm select-none' }` }>

                                            <Text
                                                variant='captionStrong'
                                                className='font-mono break-all'
                                                text={ secret } />

                                        </div>
                                    ) :
                                    (
                                        <div
                                            dir='ltr'
                                            className={ `grid grid-cols-3 gap-1.5 transition-all duration-(--duration-fast) ${ revealed ? '' : 'pointer-events-none blur-sm select-none' }` }>

                                            {
                                                words.map((word, index) => (
                                                    <Horizontal
                                                        key={ `${ index }-${ word }` }
                                                        className='items-center gap-1 rounded-control bg-base-1 px-2 py-1.5'>

                                                        <Text text={ String(index + 1) } />

                                                        <Text
                                                            variant='captionStrong'
                                                            className='truncate font-mono'
                                                            text={ word } />

                                                    </Horizontal>
                                                ))
                                            }

                                        </div>
                                    )
                            }

                            {
                                !revealed &&
                                (
                                    <Button
                                        onClick={ () => { setRevealed(true); } }
                                        className='absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-surface bg-base-2/60 text-txt-normal hover:bg-base-2/70'>

                                        <FiEye size={ 20 } />

                                        <Text
                                            variant='captionStrong'
                                            text={ T('Dashboard.Phrase.Reveal') } />

                                    </Button>
                                )
                            }

                            {
                                revealed &&
                                (
                                    <Vertical className='mt-3 gap-2'>

                                        { /*
                                          * Spelled out every time rather than shown once: a file
                                          * on shared storage outlives the moment it was written,
                                          * and the gallery copy is the one people forget.
                                          */ }
                                        <Alert
                                            className='text-start'
                                            text={ T('Dashboard.Phrase.ExportDanger') } />

                                        <Horizontal className='gap-2'>

                                            {
                                                exportList.map((item) => (
                                                    <Button
                                                        key={ item.kind }
                                                        variant='muted'
                                                        onClick={ () => { void onExport(item.kind); } }
                                                        className='h-10 min-w-0 flex-1 rounded-surface text-tiny'>

                                                        <item.icon size={ 14 } className='shrink-0' />

                                                        <Text
                                                            className='truncate'
                                                            text={ T(item.label) } />

                                                    </Button>
                                                ))
                                            }

                                        </Horizontal>

                                        { /*
                                          * Four outcomes shared one muted line, so a phrase that had
                                          * been written to disk and one that had not looked the same.
                                          */ }
                                        <Alert
                                            variant={ notice.ok ? 'success' : 'error' }
                                            text={ notice.text } />

                                    </Vertical>
                                )
                            }

                        </div>
                    )
            }

        </Modal>
    );
}
