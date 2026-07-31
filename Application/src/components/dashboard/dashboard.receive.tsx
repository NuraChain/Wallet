import type { Network } from '../../core/network';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { HiOutlineSquare2Stack } from 'react-icons/hi2';

import Button from '../ui/button';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';

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
    const [ notice, setNotice ] = useState('');

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

    const onCopy = async() =>
    {
        try
        {
            await navigator.clipboard.writeText(address);

            setNotice(T('Dashboard.Copied'));
        }
        catch
        {
            setNotice(T('Dashboard.CopyFailed'));
        }
    };

    return (
        <Modal
            onClose={ onClose }
            panelClass='items-center'>

            <ModalHeader
                title={ T('Dashboard.Receive.Title') }
                className='w-full'
                onClose={ onClose } />

            <div className='flex size-56 items-center justify-center rounded-2xl bg-white p-3'>

                {
                    qr.length > 0 && <img src={ qr } alt='' className='size-full' />
                }

            </div>

            <div className='text-center text-tiny text-txt-muted'>

                { T('Dashboard.Receive.Scan', network.symbol) }

            </div>

            <div
                dir='ltr'
                className='glass-panel w-full rounded-xl p-3 text-center font-mono text-tiny break-all text-txt-normal select-text!'>

                { address }

            </div>

            <Button
                variant='primary'
                size='action'
                fullWidth
                onClick={ () => { void onCopy(); } }>

                <HiOutlineSquare2Stack size={ 16 } />

                { T('Dashboard.Copy') }

            </Button>

            {
                notice.length > 0 &&
                (
                    <div className='text-tiny text-txt-muted'>

                        { notice }

                    </div>
                )
            }

        </Modal>
    );
}
