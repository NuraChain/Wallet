import type { Network } from '../../core/network';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Panel from '../ui/panel';
import CopyButton from '../ui/copy';
import AddressBlock from '../ui/address';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { Horizontal } from '../ui/stack';

export default function DashboardReceive({ address, network, onClose }: { address: string; network: Network; onClose: () => void }) {
    const [qr, setQr] = useState('');

    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;

        const run = async () => {
            try {
                const url = await QRCode.toDataURL(address, { margin: 1, width: 320, color: { dark: '#000000ff', light: '#ffffffff' } });

                if (active) {
                    setQr(url);
                }
            } catch {
                if (active) {
                    setFailed(true);
                }
            }
        };

        void run();

        return () => {
            active = false;
        };
    }, [address]);

    return (
        <Modal onClose={onClose} panelClass='items-center'>
            <ModalHeader title={T('Dashboard.Receive.Title')} className='w-full' onClose={onClose} />

            <Horizontal className='size-56 items-center justify-center rounded-dialog border border-badge-line bg-badge p-3'>
                {qr.length > 0 && <img src={qr} alt='' className='size-full' />}

                {failed && <TriangleAlert size={28} className='text-txt-error' />}
            </Horizontal>

            <Alert variant='error' text={failed ? T('Dashboard.Receive.QrFailed') : ''} />

            <Text className='text-center' text={T('Dashboard.Receive.Scan', network.symbol)} />

            <Panel className='w-full text-center'>
                <AddressBlock address={address} />
            </Panel>

            {/* The result rides on the button rather than an alert underneath it, which used to
                appear after the fact and grow the dialog out from under the user's finger. */}
            <CopyButton variant='primary' size='action' value={address} label={T('Dashboard.Copy')} className='w-full'>
                {T('Dashboard.Copy')}
            </CopyButton>
        </Modal>
    );
}
