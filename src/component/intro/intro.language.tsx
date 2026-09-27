import { Check } from 'lucide-react';

import MenuRow from '../../ui/menu';
import { Modal, ModalBody, ModalHeader } from '../../ui/modal';

import { T, getLanguage, setLanguage, languageRecord } from '../../utility/language';
import type { LanguageType } from '../../type/app';
import { Flag } from '../../ui/media';

export default function IntroLanguage({ onClose }: { onClose: () => void }) {
    const current = getLanguage();

    const handleSelect = async (code: LanguageType) => {
        await setLanguage(code);

        onClose();
    };

    return (
        <Modal scroll width='narrow' onClose={onClose} gap={2}>
            <ModalHeader title={T('Intro.Select')} onClose={onClose} />

            <ModalBody mt={2} short gap={2}>
                {languageRecord.map((lang) => {
                    const isActive = lang.code === current.code;

                    return (
                        <MenuRow
                            key={lang.code}
                            selected={isActive}
                            label={T(`Language.${lang.code}`)}
                            leading={<Flag src={lang.flag} />}
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
