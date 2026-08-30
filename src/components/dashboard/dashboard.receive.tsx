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

const noticeMap = {
    idle: '',
    done: 'Dashboard.Copied',
    failed: 'Dashboard.CopyFailed'
} as const;

export default function DashboardReceive({ address, network, onClose }: { address: string; network: Network; onClose: () => void }) {
    const [qr, setQr] = useState('');

    const [failed, setFailed] = useState(false);

    const clipboard = useClipboard(0);

    const notice = noticeMap[clipboard.state];

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

                {failed && <FiAlertTriangle size={28} className='text-txt-error' />}
            </Horizontal>

            <Alert variant='error' text={failed ? T('Dashboard.Receive.QrFailed') : ''} />

            <Text className='text-center' text={T('Dashboard.Receive.Scan', network.symbol)} />

            <Panel dir='ltr' className='w-full text-center font-mono text-tiny break-all text-txt-normal select-text!'>
                {address}
            </Panel>

            <Button
                variant='primary'
                size='action'
                fullWidth
                onClick={() => {
                    void clipboard.copy(address);
                }}
                leftIcon={<HiOutlineSquare2Stack size={16} />}
                text={T('Dashboard.Copy')}
            />

            <Alert variant={clipboard.state === 'failed' ? 'error' : 'success'} text={notice.length > 0 ? T(notice) : ''} />
        </Modal>
    );
}
