import Text from './text';
import Button from './button';
import { Modal, ModalActions, ModalHeader } from './modal';

import { T } from '../utility/language';
import { Vertical } from './stack';

export function ConfirmPanel({
    title,
    message,
    confirmLabel = '',
    onConfirm,
    onCancel
}: {
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Vertical gap={3}>
            <Text as='h3' variant='title' text={title} />

            <Text variant='bodyMuted' leading='relaxed' text={message} />

            <ModalActions>
                <Button variant='muted' size='action' onClick={onCancel} text={T('App.Cancel')} />

                <Button variant='destructive' size='action' onClick={onConfirm} text={confirmLabel.length > 0 ? confirmLabel : T('App.Remove')} />
            </ModalActions>
        </Vertical>
    );
}

export default function ConfirmDialog({
    title,
    message,
    confirmLabel = '',
    onConfirm,
    onCancel
}: {
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <Modal onClose={onCancel}>
            <ModalHeader title={title} onClose={onCancel} />

            <Text variant='bodyMuted' leading='relaxed' text={message} />

            <ModalActions>
                <Button variant='muted' size='action' onClick={onCancel} text={T('App.Cancel')} />

                <Button variant='destructive' size='action' onClick={onConfirm} text={confirmLabel.length > 0 ? confirmLabel : T('App.Remove')} />
            </ModalActions>
        </Modal>
    );
}
