import { FiCheck } from 'react-icons/fi';

import Button from '../ui/button';
import { Modal, ModalHeader } from '../ui/modal';

import { T, getLanguage, setLanguage, languageRecord, type LanguageType } from '../../utility/language';

export default function IntroLanguage({ onClose }: { onClose: () => void })
{
    const current = getLanguage();

    const handleSelect = async(code: LanguageType) =>
    {
        await setLanguage(code);

        onClose();
    };

    return (
        <Modal
            z='z-10'
            onClose={ onClose }
            panelClass='w-72 gap-2 rounded-lg'>

            <ModalHeader
                title={ T('Intro.Select') }
                onClose={ onClose } />

            <div />

            {
                languageRecord.map((lang) =>
                {
                    const isActive = lang.code === current.code;

                    return (
                        <Button
                            key={ lang.code }
                            variant='muted'
                            disabled={ isActive }
                            onClick={ () => { void handleSelect(lang.code); } }
                            className={ `h-12 gap-2 rounded-xl px-4 text-start duration-300 ${ isActive ? 'cursor-default!' : 'hover:bg-black/25' }` }>

                            <div className={ `fi fi-${ lang.country } size-4!` } />

                            <div className='flex-1'>

                                {
                                    T(`Language.${ lang.code }`)
                                }

                            </div>

                            {
                                isActive && <FiCheck size={ 18 } />
                            }

                        </Button>
                    );
                })
            }

        </Modal>
    );
}
