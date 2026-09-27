import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import Text from '../../ui/text';
import Alert from '../../ui/alert';
import Panel from '../../ui/panel';
import CopyButton from '../../ui/copy';
import AddressBlock from '../../ui/address';
import { Modal, ModalHeader } from '../../ui/modal';

import { T } from '../../utility/language';
import type { Network } from '../../type/network';
import { QrFrame } from '../../ui/media';

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
        <Modal onClose={onClose} align='center'>
            <ModalHeader title={T('Dashboard.Receive.Title')} width='full' onClose={onClose} />

            <QrFrame image={qr} failed={failed} />

            <Alert variant='error' text={failed ? T('Dashboard.Receive.QrFailed') : ''} />

            <Text align='center' text={T('Dashboard.Receive.Scan', network.symbol)} />

            <Panel width='full' textAlign='center'>
                <AddressBlock address={address} />
            </Panel>

            {/* The result rides on the button rather than an alert underneath it, which used to
                appear after the fact and grow the dialog out from under the user's finger. */}
            <CopyButton variant='primary' size='action' value={address} width='full'>
                {T('Dashboard.Copy')}
            </CopyButton>
        </Modal>
    );
}
