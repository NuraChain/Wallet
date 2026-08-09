import type { Swiper as SwiperType } from 'swiper';

import { Mnemonic } from 'ethers';
import { Swiper, SwiperSlide } from 'swiper/react';
import { useCallback, useRef, useState } from 'react';

import DashboardPage from '../../page/dashboard';

import Alert from '../ui/alert';
import Button from '../ui/button';
import IntroCredentials from './intro.credentials';
import { Sheet, SheetHeader } from '../ui/sheet';

import { T } from '../../utility/language';
import { passwordHash } from '../../core/password';
import { openPage } from '../../utility/context';
import { setValue, setValueEncrypted } from '../../utility/storage';
import { Vertical } from '../ui/stack';

export default function IntroImport({ onClose }: { onClose: () => void })
{
    const swiperRef = useRef<SwiperType>(undefined);

    const [ hash, setHash ] = useState('');
    const [ error, setError ] = useState('');
    const [ mnemonic, setMnemonic ] = useState('');
    const [ password, setPassword ] = useState('');
    const [ proceed, setProceed ] = useState(false);

    const onSwiper = useCallback((swiper: SwiperType) =>
    {
        swiperRef.current = swiper;
    }, [ ]);

    const onSubmit1 = async(chosen: string) =>
    {
        const hash2 = await passwordHash(chosen);

        swiperRef.current?.slideTo(1);

        setHash(hash2);

        setPassword(chosen);

        setProceed(true);
    };

    const onSubmit2 = async() =>
    {
        const mnemonic2 = mnemonic.trim().replace(/\s+/g, ' ').split(' ');

        if (mnemonic2.length !== 12 && mnemonic2.length !== 24)
        {
            setError(T('Intro.ImportWallet.ErrorInvalidLength'));

            return;
        }

        if (!Mnemonic.isValidMnemonic(mnemonic.trim().replace(/\s+/g, ' ').normalize('NFKD')))
        {
            setError(T('Intro.ImportWallet.ErrorInvalidLength'));

            return;
        }

        await setValueEncrypted('Wallet.Mnemonic', mnemonic, password);

        await setValue('Wallet.Password', hash);

        openPage(DashboardPage, { mnemonic });
    };

    return (
        <Sheet onClose={ onClose }>

            <SheetHeader
                title={ T('Intro.ImportWallet.Title') }
                subtitle={ T('Intro.ImportWallet.Subtitle') } />

            <Alert
                className='mx-auto w-fit px-4 text-small'
                text={ error } />

            <Swiper
                onSwiper={ onSwiper }
                className='h-fit w-full shrink-0'>

                <SwiperSlide style={ { display: proceed ? 'none' : '' } }>

                    <IntroCredentials
                        prefix='Intro.ImportWallet'
                        submitKey='Submit1'
                        className='px-1'
                        submitClass='mb-2'
                        onError={ setError }
                        onSubmit={ onSubmit1 } />

                </SwiperSlide>

                <SwiperSlide>

                    <Vertical className='gap-4 px-1 py-2'>

                        <textarea
                            value={ mnemonic }
                            onChange={ (event) => { setMnemonic(event.target.value); } }
                            className='min-h-28 w-full resize-none rounded-xl bg-base-3 p-3 text-small outline-0 sm:min-h-36'
                            placeholder={ T('Intro.ImportWallet.Message') } />

                        <Button
                            variant='primary'
                            onClick={ () => { void onSubmit2(); } }
                            className='mx-auto h-12 w-full rounded-lg px-4 sm:w-fit sm:px-8'
                            text={ T('Intro.ImportWallet.Submit2') } />

                    </Vertical>

                </SwiperSlide>

            </Swiper>

        </Sheet>
    );
}
