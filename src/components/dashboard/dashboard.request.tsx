import { useState } from 'react';
import { FiGlobe } from 'react-icons/fi';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Panel from '../ui/panel';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import { Horizontal, Vertical } from '../ui/stack';
import { Modal, ModalActions, ModalBody, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { shortAddress } from '../../utility/format';
import { resolveDappPrompt, type DappPrompt } from '../../core/dapp.rpc';

/**
 * The heading each kind of request is shown under.
 *
 * Kept as a lookup rather than a chain of conditions in the JSX, because every one of these is a
 * translation key and a list of them is what makes it obvious that one is missing.
 */
const titleMap: Record<DappPrompt['kind'], string> =
{
    connect: 'Dashboard.Request.Connect',
    signature: 'Dashboard.Request.Signature',
    typed: 'Dashboard.Request.Typed',
    transaction: 'Dashboard.Request.Transaction',
    chain: 'Dashboard.Request.Chain',
    asset: 'Dashboard.Request.Asset'
};

/**
 * The line under the heading that says what approving actually does.
 */
const noteMap: Record<DappPrompt['kind'], string> =
{
    connect: 'Dashboard.Request.ConnectNote',
    signature: 'Dashboard.Request.SignatureNote',
    typed: 'Dashboard.Request.TypedNote',
    transaction: 'Dashboard.Request.TransactionNote',
    chain: 'Dashboard.Request.ChainNote',
    asset: 'Dashboard.Request.AssetNote'
};

/**
 * DashboardRequest - The one dialog every dApp request is approved or refused through.
 *
 * It is mounted beside the wallet's other dialogs rather than inside the browser tab, and that is not
 * a layout preference. A page in the browser is painted by an OS-level webview laid *over* the app's
 * own — a child webview on desktop, a sibling `android.webkit.WebView` on Android — so nothing
 * rendered inside that tab can appear above it. The dashboard hides the view while a prompt is up,
 * which is what puts this sheet on screen at all.
 *
 * Refusing is the default in every sense that matters here: it is what the close control does, what
 * the backdrop does, and what happens to everything still queued when the wallet locks. A prompt that
 * could be dismissed into nothing would leave the page waiting on a promise that never settles.
 *
 * The payload rows are deliberately plain text in a mono block rather than anything parsed or
 * prettified. A signing prompt is only worth showing if the user can see exactly what they are
 * signing, and a renderer that interprets the payload is a renderer that can be made to show
 * something other than what will be signed.
 * @param {object} props Component props.
 * @param {DappPrompt} props.prompt The request waiting on the user.
 * @param {string} props.address The account the site would be given, and the one that would sign.
 * @param {string} props.network The active network's name, for the rows that mention it.
 * @returns {JSX.Element} The approval sheet.
 */
export default function DashboardRequest({ prompt, address, network }: { prompt: DappPrompt; address: string; network: string })
{
    const [ isLoading, setIsLoading ] = useState(false);

    // The queue moves on the moment this resolves, so the sheet is replaced by the next prompt or
    // unmounted entirely. The flag exists only for the instant between the tap and that happening,
    // which is enough to stop a double tap answering two different requests with one decision.
    const onAnswer = (approved: boolean) =>
    {
        if (isLoading)
        {
            return;
        }

        setIsLoading(true);

        resolveDappPrompt(prompt.id, approved);
    };

    const onClose = () => { onAnswer(false); };

    /**
     * The label/value rows this kind of request restates before it is approved.
     *
     * Built per kind rather than rendered by six separate blocks: they are the same row drawn from
     * different fields, and the differences are which fields exist.
     */
    const rowMap = (): { label: string; value: string; mono: boolean }[] =>
    {
        if (prompt.kind === 'transaction' && prompt.transaction !== undefined)
        {
            const { to, value, fee, data } = prompt.transaction;

            return [
                { label: T('Dashboard.Request.To'), value: to.length > 0 ? shortAddress(to) : T('Dashboard.Request.Deploy'), mono: true },
                { label: T('Dashboard.Request.Value'), value, mono: true },
                ...fee.length > 0 ? [ { label: T('Dashboard.Request.Fee'), value: fee, mono: true } ] : [],
                { label: T('Dashboard.Network.Title'), value: network, mono: false },
                ...data.length > 0 ? [ { label: T('Dashboard.Request.Data'), value: T('Dashboard.Request.DataSize', Math.max(0, (data.length - 2) / 2)), mono: false } ] : []
            ];
        }

        if (prompt.kind === 'chain' && prompt.chain !== undefined)
        {
            return [
                { label: T('Dashboard.Request.ChainName'), value: prompt.chain.name, mono: false },
                { label: T('Dashboard.Network.ChainId'), value: String(prompt.chain.id), mono: true }
            ];
        }

        if (prompt.kind === 'asset' && prompt.asset !== undefined)
        {
            return [
                { label: T('Dashboard.Request.AssetSymbol'), value: prompt.asset.symbol.length > 0 ? prompt.asset.symbol : '—', mono: false },
                { label: T('Dashboard.Request.AssetAddress'), value: shortAddress(prompt.asset.address), mono: true },
                { label: T('Dashboard.Network.Title'), value: network, mono: false }
            ];
        }

        return [
            { label: T('Dashboard.Request.Account'), value: shortAddress(address), mono: true },
            { label: T('Dashboard.Network.Title'), value: network, mono: false }
        ];
    };

    const rows = rowMap();

    // Only the two signing kinds have a payload worth putting in front of someone, and they are the
    // two where not showing it would make the prompt meaningless.
    const payload = prompt.kind === 'signature' || prompt.kind === 'typed' ? prompt.summary : '';

    // The endpoint gets the same treatment as a signable payload, and for the same reason. Approving a
    // network points every balance read, gas estimate and broadcast at this address, so it has to be
    // readable in full — truncated into a row, the part that gives a lookalike away is the part that
    // gets cut off.
    const endpoint = prompt.kind === 'chain' ? prompt.chain?.rpc ?? '' : '';

    return (
        <Modal
            scroll
            onClose={ onClose }>

            <ModalHeader
                title={ T(titleMap[prompt.kind]) }
                onClose={ onClose } />

            { /*
              * The origin leads, because it is the only part of this a person can actually judge. It
              * is forced to `ltr` and left unwrapped for the same reason an address is: a host read
              * right-to-left, or broken across a line, is a host that can be made to look like a
              * different one.
              */ }
            <Panel className='flex items-center gap-2 rounded-surface p-3'>

                <IconBox tone='primary'>

                    <FiGlobe size={ 16 } />

                </IconBox>

                <Text
                    variant='captionStrong'
                    dir='ltr'
                    className='min-w-0 truncate font-mono'
                    text={ prompt.origin } />

            </Panel>

            <Alert
                variant={ prompt.kind === 'connect' ? 'warning' : 'danger' }
                text={ T(noteMap[prompt.kind]) } />

            <ModalBody>

                <Panel className='flex flex-col gap-2 rounded-surface p-3'>

                    {
                        rows.map((item) => (
                            <Horizontal
                                key={ item.label }
                                className='items-center justify-between gap-2'>

                                <Text text={ item.label } />

                                <Text
                                    variant='captionStrong'
                                    dir={ item.mono ? 'ltr' : undefined }
                                    className={ item.mono ? 'min-w-0 truncate font-mono' : 'min-w-0 truncate' }
                                    text={ item.value } />

                            </Horizontal>
                        ))
                    }

                </Panel>

                {
                    endpoint.length > 0 &&
                    (
                        <Vertical className='gap-1'>

                            <Text text={ T('Dashboard.Request.ChainRpc') } />

                            <Panel className='rounded-surface p-3'>

                                <Text
                                    variant='captionStrong'
                                    dir='ltr'
                                    className='font-mono wrap-break-word'
                                    text={ endpoint } />

                            </Panel>

                        </Vertical>
                    )
                }

                {
                    payload.length > 0 &&
                    (
                        <Vertical className='gap-1'>

                            <Text text={ T('Dashboard.Request.Message') } />

                            { /*
                              * `whitespace-pre-wrap` and nothing else: the payload is shown exactly as
                              * it will be signed, newlines and all, which is what makes a sign-in
                              * message readable and an opaque one visibly opaque.
                              */ }
                            <Panel className='max-h-48 overflow-y-auto overscroll-contain rounded-surface p-3'>

                                <Text
                                    variant='captionStrong'
                                    dir='ltr'
                                    className='font-mono wrap-break-word whitespace-pre-wrap'
                                    text={ payload } />

                            </Panel>

                        </Vertical>
                    )
                }

            </ModalBody>

            <ModalActions>

                <Button
                    variant='muted'
                    size='action'
                    disabled={ isLoading }
                    onClick={ onClose }
                    className='disabled:opacity-60'
                    text={ T('Dashboard.Request.Reject') } />

                <Button
                    variant='primary'
                    size='action'
                    disabled={ isLoading }
                    onClick={ () => { onAnswer(true); } }
                    className='disabled:opacity-60'
                    text={ T('Dashboard.Request.Approve') } />

            </ModalActions>

        </Modal>
    );
}
