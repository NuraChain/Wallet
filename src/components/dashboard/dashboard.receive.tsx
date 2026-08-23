import type { Network } from '../../core/network';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import { HiOutlineSquare2Stack } from 'react-icons/hi2';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Panel from '../ui/panel';
import Button from '../ui/button';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { useClipboard } from '../../hook/clipboard';
import { Horizontal } from '../ui/stack';

/**
 * What each outcome of the copy says. `idle` says nothing, so the line is absent until the button has
 * been pressed at least once.
 */
const noticeMap =
{
    idle: '',
    done: 'Dashboard.Copied',
    failed: 'Dashboard.CopyFailed'
} as const;

/**
 * DashboardReceive - Shows the account address as a QR code plus a copy control.
 *
 * The QR is rendered to a data URL once per address so it survives re-renders without regenerating.
 * @param {object} props Component props.
 * @param {string} props.address The receiving address.
 * @param {Network} props.network The active network (labels the coin being received).
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The receive modal.
 */
export default function DashboardReceive({ address, network, onClose }: { address: string; network: Network; onClose: () => void })
{
    const [ qr, setQr ] = useState('');

    // The acknowledgement is a line of text under a dialog the user closes themselves, so it stays up
    // rather than clearing itself out from under them.
    const [ failed, setFailed ] = useState(false);

    const clipboard = useClipboard(0);

    const notice = noticeMap[clipboard.state];

    useEffect(() =>
    {
        let active = true;

        const run = async() =>
        {
            try
            {
                const url = await QRCode.toDataURL(address, { margin: 1, width: 320, color: { dark: '#000000ff', light: '#ffffffff' } });

                if (active)
                {
                    setQr(url);
                }
            }
            catch
            {
                // The encoder rejecting used to leave the tile permanently blank with nothing said,
                // on a screen whose entire purpose is to be scanned. The address below it is still
                // correct and still copyable, so the failure is reported rather than the dialog
                // being torn down.
                if (active)
                {
                    setFailed(true);
                }
            }
        };

        void run();

        return () =>
        {
            active = false;
        };
    }, [ address ]);

    return (
        <Modal
            onClose={ onClose }
            panelClass='items-center'>

            <ModalHeader
                title={ T('Dashboard.Receive.Title') }
                className='w-full'
                onClose={ onClose } />

            { /*
              * Pure white, pinned across both themes: a themed QR is an unscannable QR. `--badge` is
              * `oklch(100% 0 0)` in both blocks and exists for exactly this — the raw `bg-white` it
              * replaces was the only Tailwind palette class left in the app.
              */ }
            <Horizontal className='size-56 items-center justify-center rounded-dialog border border-badge-line bg-badge p-3'>

                {
                    qr.length > 0 && <img src={ qr } alt='' className='size-full' />
                }

                {
                    failed && <FiAlertTriangle size={ 28 } className='text-txt-error' />
                }

            </Horizontal>

            <Alert
                variant='error'
                text={ failed ? T('Dashboard.Receive.QrFailed') : '' } />

            <Text
                className='text-center'
                text={ T('Dashboard.Receive.Scan', network.symbol) } />

            <Panel
                dir='ltr'
                className='w-full text-center font-mono text-tiny break-all text-txt-normal select-text!'>

                { address }

            </Panel>

            <Button
                variant='primary'
                size='action'
                fullWidth
                onClick={ () => { void clipboard.copy(address); } }
                leftIcon={ <HiOutlineSquare2Stack size={ 16 } /> }
                text={ T('Dashboard.Copy') } />

            { /*
              * The outcome decides the tone. Both branches used to render through one muted caption,
              * so "address copied" and "the address could not be copied" were the same grey line —
              * indistinguishable at exactly the moment the user is about to paste something.
              */ }
            <Alert
                variant={ clipboard.state === 'failed' ? 'error' : 'success' }
                text={ notice.length > 0 ? T(notice) : '' } />

        </Modal>
    );
}
