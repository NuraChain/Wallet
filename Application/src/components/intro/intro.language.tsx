import { motion } from 'motion/react';
import { FiCheck } from 'react-icons/fi';
import { IoClose } from 'react-icons/io5';

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
        <>

            <motion.div
                initial={ { opacity: 0 } }
                animate={ { opacity: 1 } }
                exit={ { opacity: 0 } }
                className='absolute z-10 size-full cursor-pointer bg-black/25 backdrop-blur-xs'
                onClick={ onClose } />

            <div className='absolute inset-0 z-10 m-auto flex size-fit items-center justify-center'>

                <motion.div
                    initial={ { opacity: 0, scale: 0.9 } }
                    animate={ { opacity: 1, scale: 1 } }
                    exit={ { opacity: 0, scale: 0.9 } }
                    className='glass-panel flex w-72 flex-col gap-2 rounded-lg p-4'>

                    <div className='flex items-center justify-between'>

                        <div className='text-medium text-txt-normal font-bold'>

                            {
                                T('Intro.Select')
                            }

                        </div>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted flex size-8 items-center justify-center rounded-lg'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

                    <div />

                    {
                        languageRecord.map((lang) =>
                        {
                            const isActive = lang.code === current.code;

                            return (
                                <button
                                    key={ lang.code }
                                    type='button'
                                    disabled={ isActive }
                                    onClick={ () => { void handleSelect(lang.code); } }
                                    className={ `btn-muted flex h-12 items-center gap-2 rounded-xl px-4 text-start duration-300 ${ isActive ? 'cursor-default!' : 'hover:bg-black/25' }` }>

                                    <div className={ `fi fi-${ lang.country } size-4!` } />

                                    <div className='flex-1'>

                                        {
                                            T(`Language.${ lang.code }`)
                                        }

                                    </div>

                                    {
                                        isActive && <FiCheck size={ 18 } />
                                    }

                                </button>
                            );
                        })
                    }

                </motion.div>

            </div>

        </>
    );
}
