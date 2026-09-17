import { Check } from 'lucide-react';

import MenuRow from '../ui/menu';
import { Modal, ModalBody, ModalHeader } from '../ui/modal';

import { T, getLanguage, setLanguage, languageRecord, type LanguageType } from '../../utility/language';

export default function IntroLanguage({ onClose }: { onClose: () => void }) {
    const current = getLanguage();

    const handleSelect = async (code: LanguageType) => {
        await setLanguage(code);

        onClose();
    };

    return (
        <Modal scroll width='narrow' onClose={onClose} panelClass='gap-2'>
            <ModalHeader title={T('Intro.Select')} onClose={onClose} />

            <ModalBody className='mt-2 max-h-72 gap-2'>
                {languageRecord.map((lang) => {
                    const isActive = lang.code === current.code;

                    return (
                        <MenuRow
                            key={lang.code}
                            selected={isActive}
                            label={T(`Language.${lang.code}`)}
                            leading={<img src={lang.flag} alt='' className='size-4 shrink-0 object-contain' />}
                            trailing={isActive ? <Check size={18} /> : undefined}
                            onClick={() => {
                                void handleSelect(lang.code);
                            }}
                        />
                    );
                })}
            </ModalBody>
        </Modal>
    );
}
