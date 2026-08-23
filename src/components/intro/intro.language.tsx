import { FiCheck } from 'react-icons/fi';

import Button from '../ui/button';
import { Modal, ModalBody, ModalHeader } from '../ui/modal';

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
            scroll={ true }
            onClose={ onClose }
            panelClass='w-72 gap-2 rounded-control'>

            <ModalHeader
                title={ T('Intro.Select') }
                onClose={ onClose } />

            { /*
              * The list carries its own top padding rather than the panel's gap being padded out by an
              * empty element, which is how the space under the header used to be made.
              *
              * The active row is disabled because it is the one you are already on, not because it is
              * unavailable — so it keeps the ordinary cursor instead of the "no" one.
              *
              * Ten rows of `h-12` outgrow a short window, so the list is a `ModalBody` and the panel
              * caps itself: with two languages the dialog shrink-wrapped and neither was needed.
              *
              * The cap is 18rem because that is five rows (5×3rem plus their four gaps = 17rem) and
              * one more gap, so the sixth row is cut mid-height rather than landing flush against the
              * edge — a half-row is what tells you the list keeps going. The panel's own `80vh` is
              * left as the backstop for a window too short even for this, and on any ordinary window
              * this is the smaller of the two, which is the point: `80vh` alone let the dialog grow to
              * most of a desktop screen.
              */ }
            <ModalBody className='mt-2 max-h-72 gap-2'>

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
                                className={ `h-12 gap-2 rounded-surface px-4 text-start duration-(--duration-fast) ${ isActive ? 'disabled:cursor-default!' : '' }` }>

                                { /* The 4x3 flag is letterboxed into a square rather than stretched, so a wide
                                     flag keeps its proportions and every row's icon occupies the same box. */ }
                                <img
                                    src={ lang.flag }
                                    alt=''
                                    className='size-4 shrink-0 object-contain' />

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

            </ModalBody>

        </Modal>
    );
}
