import type { Network } from '../core/network';

import QRCode from 'qrcode';
import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';
import { useEffect, useState } from 'react';
import { HiOutlineSquare2Stack } from 'react-icons/hi2';

import { T } from '../utility/language';

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
                    className='glass-panel flex w-80 flex-col items-center gap-3 rounded-2xl p-4'>

                    <div className='flex w-full items-center justify-between'>

                        <div className='text-medium font-bold text-txt-normal'>

                            { T('Dashboard.Receive.Title') }

                        </div>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted flex size-8 items-center justify-center rounded-lg'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

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

                    <button
                        type='button'
                        onClick={ () => { void onCopy(); } }
                        className='btn-primary flex h-11 w-full items-center justify-center gap-2 rounded-xl text-small'>

                        <HiOutlineSquare2Stack size={ 16 } />

                        { T('Dashboard.Copy') }

                    </button>

                    {
                        notice.length > 0 &&
                        (
                            <div className='text-tiny text-txt-muted'>

                                { notice }

                            </div>
                        )
                    }

                </motion.div>

            </div>
        </>
    );
}
