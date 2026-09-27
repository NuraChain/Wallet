import Text from '../../ui/text';
import IconBox from '../../ui/iconbox';
import { Modal, ModalHeader } from '../../ui/modal';
import { Horizontal, Vertical } from '../../ui/stack';

import Logo from '../../assets/image/logo.png';
import { T } from '../../utility/language';
import { setMouseOpacity } from '../../core/mouse';
import { useMouseOpacity } from '../../hook/mouse';

export default function DashboardMouse({ onClose }: { onClose: () => void }) {
    const percent = Math.round(useMouseOpacity() * 100);

    // Applied as it moves, so the mouse itself is the preview.
    const onChange = (value: number) => {
        void setMouseOpacity(value / 100);
    };

    return (
        <Modal onClose={onClose}>
            <ModalHeader
                title={T('Dashboard.Mouse.Title')}
                onClose={onClose}
                leading={
                    <IconBox tone='primary'>
                        <img src={Logo} alt='' className='size-5' />
                    </IconBox>
                }
            />

            <Vertical gap={2}>
                <Horizontal align='center' justify='between'>
                    <Text id='mouse-opacity' variant='captionStrong' text={T('Dashboard.Mouse.Opacity')} />

                    <Text dir='ltr' tabular text={`${percent}%`} />
                </Horizontal>

                <input
                    type='range'
                    min={10}
                    max={100}
                    step={5}
                    value={percent}
                    aria-labelledby='mouse-opacity'
                    onChange={(event) => {
                        onChange(Number(event.target.value));
                    }}
                    className='h-6 w-full cursor-pointer accent-btn-primary'
                />
            </Vertical>
        </Modal>
    );
}
