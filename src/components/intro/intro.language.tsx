import { FiCheck } from 'react-icons/fi';

import Button from '../ui/button';
import { Modal, ModalHeader } from '../ui/modal';

import { T, getLanguage, setLanguage, languageRecord, type LanguageType } from '../../utility/language';
import { Vertical } from '../ui/stack';

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

            { /*
              * The list carries its own top padding rather than the panel's gap being padded out by an
              * empty element, which is how the space under the header used to be made.
              *
              * The active row is disabled because it is the one you are already on, not because it is
              * unavailable — so it keeps the ordinary cursor instead of the "no" one.
              */ }
            <Vertical className='gap-2 pt-2'>

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
                                className={ `h-12 gap-2 rounded-xl px-4 text-start duration-300 ${ isActive ? 'disabled:cursor-default!' : '' }` }>

                                { /* `fi-<country>` is flag-icons' own class rather than a Tailwind utility, so the
                                     scanner has nothing to miss here and there is nothing to purge. The rule cannot
                                     tell the two apart, which is why `no-unknown-classes` is off in the lint config
                                     for the same pair of classes. */ }
                                { /* eslint-disable-next-line better-tailwindcss/no-concatenated-classes */ }
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

            </Vertical>

        </Modal>
    );
}
