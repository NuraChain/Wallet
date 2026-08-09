import type { Network } from '../../core/network';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { HiOutlineSquare2Stack } from 'react-icons/hi2';

import Text from '../ui/text';
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
    const clipboard = useClipboard(0);

    const notice = noticeMap[clipboard.state];

    useEffect(() =>
    {
        let active = true;

        const run = async() =>
        {
            const url = await QRCode.toDataURL(address, { margin: 1, width: 320, color: { dark: '#000000ff', light: '#ffffffff' } });

            if (active)
            {
                setQr(url);
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

            { /* Pure black on white: a themed QR is an unscannable QR. */ }
            <Horizontal className='size-56 items-center justify-center rounded-2xl bg-white p-3'>

                {
                    qr.length > 0 && <img src={ qr } alt='' className='size-full' />
                }

            </Horizontal>

            <Text
                className='text-center'
                text={ T('Dashboard.Receive.Scan', network.symbol) } />

            <Panel
                dir='ltr'
                className='w-full rounded-xl p-3 text-center font-mono text-tiny break-all text-txt-normal select-text!'>

                { address }

            </Panel>

            <Button
                variant='primary'
                size='action'
                fullWidth
                onClick={ () => { void clipboard.copy(address); } }
                leftIcon={ <HiOutlineSquare2Stack size={ 16 } /> }
                text={ T('Dashboard.Copy') } />

            {
                notice.length > 0 && <Text text={ T(notice) } />
            }

        </Modal>
    );
}
